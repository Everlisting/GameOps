/**
 * 种子脚本:创建初始管理员账号 + 示例活动(供创作者端开发预览)。
 * 运营/管理员不开放自助注册,首个管理员由此脚本创建。
 * 运行:pnpm db:seed
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function seedAdmin() {
  const username = "admin";
  const password = "admin123456"; // ⚠️ 首次登录后请立即修改

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`管理员 ${username} 已存在,跳过。`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await argon2.hash(password),
      role: "ADMIN",
      status: "active", // seed 出来的管理员直接可登录,绕过新默认 pending
    },
  });
  console.log(`已创建管理员账号:${username} / ${password}(请尽快修改密码)`);
}

const SAMPLE_COVERS = [
  "https://picsum.photos/seed/gameops-launch/960/540",
  "https://picsum.photos/seed/gameops-monthly/960/540",
  "https://picsum.photos/seed/gameops-summer/960/540",
];

async function seedActivities() {
  const now = new Date();
  const day = (n: number) => new Date(now.getTime() + n * 86400_000);

  const count = await prisma.activity.count();
  if (count === 0) {
    await prisma.activity.createMany({
      data: [
        {
          name: "新作首发激励 · 2026年5月",
          description: "面向所有创作者:发布新作品并提交链接,通过审核即可获得首发激励。",
          coverImage: SAMPLE_COVERS[0],
          status: "ONGOING",
          startAt: day(-3),
          endAt: day(14),
        },
        {
          name: "高质量内容月评",
          description: "提交本月最满意的一篇作品,运营月底统一评选并发放奖励。",
          coverImage: SAMPLE_COVERS[1],
          status: "ONGOING",
          startAt: day(-1),
          endAt: day(20),
        },
        {
          name: "夏季主题创作大赛(预告)",
          description: "六月开启,主题、奖项即将公布。",
          coverImage: SAMPLE_COVERS[2],
          status: "DRAFT",
          startAt: day(7),
          endAt: day(45),
        },
      ],
    });
    console.log("已写入 3 个示例活动。");
    return;
  }

  // 已有活动:给没有封面的补一个
  const missing = await prisma.activity.findMany({
    where: { coverImage: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (let i = 0; i < missing.length; i++) {
    await prisma.activity.update({
      where: { id: missing[i].id },
      data: { coverImage: SAMPLE_COVERS[i % SAMPLE_COVERS.length] },
    });
  }
  if (missing.length > 0) console.log(`已为 ${missing.length} 个已有活动补封面。`);
  else console.log(`已有 ${count} 个活动且封面齐全,跳过。`);
}

async function main() {
  await seedAdmin();
  await seedActivities();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
