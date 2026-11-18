import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import ReviewTagManager from "../_components/ReviewTagManager";

export default async function ReviewTagsPage() {
  await requireRole("OPERATOR");
  const tags = await prisma.reviewTag.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      parentId: true,
      sortOrder: true,
      enabled: true,
      _count: { select: { submissions: true, videos: true } },
    },
  });
  return (
    <ReviewTagManager
      tags={tags.map((tag) => ({ ...tag, usage: tag._count.submissions + tag._count.videos }))}
    />
  );
}
