-- 知识库 per-role 权限:visibleToAll → visibleToOperator + visibleToCreator
ALTER TABLE "knowledge_base" ADD COLUMN "visibleToOperator" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "knowledge_base" ADD COLUMN "visibleToCreator" BOOLEAN NOT NULL DEFAULT false;

-- 保留原语义:原来"全体运营可见"的库 → 运营可见
UPDATE "knowledge_base" SET "visibleToOperator" = "visibleToAll";

ALTER TABLE "knowledge_base" DROP COLUMN "visibleToAll";
