import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac";
export default async function SubmissionPeriodsPage() {
  await requireRole("REVIEWER");
  redirect("/operator/submissions");
}
