import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { authorizeCrawl } from "@/lib/ownership";
import { CrawlChrome } from "@/components/CrawlChrome";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CrawlLayout({ children, params }: Props) {
  const { id } = await params;
  const crawlId = await authorizeCrawl(id);
  if (!crawlId) notFound();

  const crawl = await prisma.crawl.findUnique({
    where: { id: crawlId },
    select: { id: true, seedUrl: true, status: true },
  });
  if (!crawl) notFound();

  return (
    <CrawlChrome crawlId={crawl.id} seedUrl={crawl.seedUrl} initialStatus={crawl.status}>
      {children}
    </CrawlChrome>
  );
}
