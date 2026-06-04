-- RawDataset.csvType 改为可空:csvType=NULL 表示"仅留底,不入解析层"
ALTER TABLE "RawDataset" ALTER COLUMN "csvType" DROP NOT NULL;
