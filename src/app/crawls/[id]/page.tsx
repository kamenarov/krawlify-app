import { redirect } from "next/navigation";

export default async function CrawlIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/crawls/${id}/internal`);
}
