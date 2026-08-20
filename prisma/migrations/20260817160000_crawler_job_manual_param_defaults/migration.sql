-- 手动触发参数记忆与 cron 参数默认值分离。
ALTER TABLE "CrawlerJob"
ADD COLUMN "manualParamDefaults" JSONB NOT NULL DEFAULT '{}';

-- 现有 paramSchema.default 可能来自最近一次手动触发。先复制到手动记忆，
-- 使管理员后续修正 cron 默认值时不会丢失手动表单的最近填写值。
UPDATE "CrawlerJob"
SET "manualParamDefaults" = COALESCE(
  (
    SELECT jsonb_object_agg(item->>'name', item->'default')
    FROM jsonb_array_elements("CrawlerJob"."paramSchema") AS item
    WHERE item ? 'default'
  ),
  '{}'::jsonb
);
