-- CreateTable
CREATE TABLE "feishu_report_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "titleTemplate" TEXT NOT NULL DEFAULT '运营数据日报 · {{date}}',
    "cardTemplate" TEXT NOT NULL DEFAULT 'blue',
    "intro" TEXT NOT NULL DEFAULT '',
    "showVideoSummary" BOOLEAN NOT NULL DEFAULT true,
    "videoSummaryTitle" TEXT NOT NULL DEFAULT '视频(本月至今)',
    "showTopVideos" BOOLEAN NOT NULL DEFAULT true,
    "topVideosTitle" TEXT NOT NULL DEFAULT 'Top{{topN}} 作品(本月播放量)',
    "topVideoLimit" INTEGER NOT NULL DEFAULT 5,
    "showActivities" BOOLEAN NOT NULL DEFAULT true,
    "activitiesTitle" TEXT NOT NULL DEFAULT '活动',
    "footer" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feishu_report_config_pkey" PRIMARY KEY ("id")
);
