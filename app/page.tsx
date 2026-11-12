import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homePathForRole } from "@/lib/roles";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(homePathForRole(session.role));
}
