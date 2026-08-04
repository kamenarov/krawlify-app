import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { StatusBadge } from "@/components/StatusBadge";
import { DeleteCrawlButton } from "@/components/DeleteCrawlButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { user: viewUserParam } = await searchParams;

  // Admins may view another user's crawls via ?user=<id>.
  let targetUserId = me.id;
  let viewingOther: { id: string; email: string } | null = null;
  if (viewUserParam && me.role === "admin" && viewUserParam !== me.id) {
    const target = await prisma.user.findUnique({
      where: { id: viewUserParam },
      select: { id: true, email: true },
    });
    if (target) {
      targetUserId = target.id;
      viewingOther = target;
    }
  }

  const crawls = await prisma.crawl.findMany({
    where: { userId: targetUserId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <h1 className="text-2xl font-bold">Crawls</h1>
            <p className="text-sm text-gray-500">
              {PRODUCT_NAME} — {PRODUCT_TAGLINE}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/crawls/new"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New crawl
          </Link>
          {me.role === "admin" && (
            <Link
              href="/settings/users"
              className="rounded border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Users
            </Link>
          )}
          <Link
            href="/settings"
            className="rounded border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Settings
          </Link>
          <SignOutButton />
          <ThemeToggle />
        </div>
      </header>

      {viewingOther && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm">
          <span className="text-purple-800">
            Viewing crawls for <strong>{viewingOther.email}</strong> (admin)
          </span>
          <Link href="/" className="text-purple-700 hover:underline">
            ← Back to your crawls
          </Link>
        </div>
      )}

      {crawls.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center text-gray-500">
          No crawls yet. Start your first crawl.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Seed URL</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Crawled</th>
                <th className="px-4 py-3">Found</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {crawls.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/crawls/${c.id}/internal`} className="font-medium text-blue-600 hover:underline">
                      {c.seedUrl}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 tabular">{c.totalCrawled.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular">{c.totalFound.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.startedAt ? new Date(c.startedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteCrawlButton crawlId={c.id} seedUrl={c.seedUrl} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
