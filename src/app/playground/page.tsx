import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ApiPlayground } from "@/components/ApiPlayground";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  return <ApiPlayground />;
}
