-- CreateTable
CREATE TABLE "CsvType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "columns" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsvType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CsvType_name_key" ON "CsvType"("name");

-- CreateIndex
CREATE INDEX "CsvType_name_idx" ON "CsvType"("name");

-- AddForeignKey
ALTER TABLE "CsvType" ADD CONSTRAINT "CsvType_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed:把代码里 douyin_video_detail 的 15 列搬进 DB。
-- updatedAt 用 NOW() 兜底(等价 CURRENT_TIMESTAMP)。
INSERT INTO "CsvType" ("id", "name", "label", "columns", "updatedAt") VALUES (
  'cseed-douyin-video-detail',
  'douyin_video_detail',
  '抖音视频明细表',
  '[
    {"name":"UID","type":"string"},
    {"name":"主播名称","type":"string"},
    {"name":"主播账号","type":"string"},
    {"name":"视频链接","type":"url"},
    {"name":"视频标题","type":"string"},
    {"name":"发布时间","type":"date"},
    {"name":"播放量","type":"number"},
    {"name":"推荐播放量","type":"number"},
    {"name":"点赞量","type":"number"},
    {"name":"评论量","type":"number"},
    {"name":"分享量","type":"number"},
    {"name":"涨粉量","type":"number"},
    {"name":"运营经纪人","type":"string"},
    {"name":"招募经纪人","type":"string"},
    {"name":"备注","type":"string"}
  ]'::jsonb,
  NOW()
)
ON CONFLICT ("name") DO NOTHING;
