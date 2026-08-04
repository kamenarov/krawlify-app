import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UserManager } from "@/components/UserManager";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/settings");
  return <UserManager />;
}
