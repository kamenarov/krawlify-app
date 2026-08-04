import "dotenv/config";
import { prisma } from "../src/lib/db";
import { crawlQueue } from "../src/lib/queue";
import { crawlConfigSchema } from "../src/lib/events";
import { hostOf, normalizeUrl } from "../src/crawler/url";

const seed = process.argv[2] ?? "https://books.toscrape.com/";
const maxUrls = Number(process.argv[3] ?? 25);

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user — run prisma:seed first");

  const config = crawlConfigSchema.parse({
    seedUrl: seed,
    maxDepth: 2,
    maxUrls,
    concurrency: 8,
    respectRobots: true,
    followNofollow: false,
    includeExternal: true,
    checkAssets: true,
  });
  const normSeed = normalizeUrl(config.seedUrl)!;

  const crawl = await prisma.crawl.create({
    data: {
      userId: user.id,
      seedUrl: normSeed,
      rootHost: hostOf(normSeed),
      status: "queued",
      config: { ...config, seedUrl: normSeed },
    },
  });
  await crawlQueue.add("crawl", { crawlId: crawl.id, config: { ...config, seedUrl: normSeed } });
  console.log(`Enqueued crawl ${crawl.id} → ${normSeed} (maxUrls=${maxUrls})`);

  // Poll until terminal.
  let status = "queued";
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const c = await prisma.crawl.findUnique({ where: { id: crawl.id } });
    if (!c) break;
    status = c.status;
    process.stdout.write(`\r[${status}] crawled=${c.totalCrawled} found=${c.totalFound}   `);
    if (["done", "failed", "stopped"].includes(status)) break;
  }
  console.log("\n");

  const [pages, redirects, assets, brokenAssets, orphans, issues] = await Promise.all([
    prisma.page.count({ where: { crawlId: crawl.id } }),
    prisma.redirect.count({ where: { crawlId: crawl.id } }),
    prisma.asset.count({ where: { crawlId: crawl.id } }),
    prisma.asset.count({ where: { crawlId: crawl.id, isBroken: true } }),
    prisma.page.count({ where: { crawlId: crawl.id, isOrphan: true } }),
    prisma.issue.findMany({ where: { crawlId: crawl.id }, orderBy: { count: "desc" } }),
  ]);

  const samplePages = await prisma.page.findMany({
    where: { crawlId: crawl.id, statusClass: 2, title: { not: null } },
    select: { url: true, statusCode: true, title: true, titleLength: true, h1Count: true, inlinkCount: true, wordCount: true },
    take: 3,
  });
  const sampleImages = await prisma.asset.findMany({
    where: { crawlId: crawl.id, type: "img" },
    select: { url: true, statusCode: true, altText: true, altIssues: true },
    take: 3,
  });

  console.log("=== RESULTS ===");
  console.log({ status, pages, redirects, assets, brokenAssets, orphans });
  console.log("--- issues ---");
  for (const i of issues) console.log(`  ${i.category}: ${i.count} (${i.severity})`);
  console.log("--- sample pages ---");
  for (const p of samplePages) console.log(" ", JSON.stringify(p));
  console.log("--- sample images ---");
  for (const im of sampleImages) console.log(" ", JSON.stringify(im));

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
