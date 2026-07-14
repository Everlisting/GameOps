import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const tasks = await prisma.crawlerTask.findMany({
  orderBy: { createdAt: "desc" },
  take: 5,
  select: {
    id: true, sequenceNumber: true, status: true, priority: true,
    createdAt: true, startedAt: true, finishedAt: true,
    exitCode: true, errorMessage: true, logPath: true,
    agentId: true,
    job: { select: { name: true } },
  },
});
for (const t of tasks) {
  console.log("── task", t.id, "seq#" + t.sequenceNumber, "[" + t.status + "]");
  console.log("   job     :", t.job?.name, " agentId:", t.agentId ?? "(null)");
  console.log("   created :", t.createdAt?.toISOString(), " started:", t.startedAt?.toISOString() ?? "-", " finished:", t.finishedAt?.toISOString() ?? "-");
  console.log("   exitCode:", t.exitCode ?? "-", " logPath:", t.logPath ?? "-");
  if (t.errorMessage) console.log("   error   :", t.errorMessage.slice(0, 500));
}
await prisma.$disconnect();
