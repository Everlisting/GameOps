/**
 * CsvType 元数据的服务端读取入口。
 *
 * 数据源:CsvType DB 表(取代以前硬编码在 lib/parsers/columns.ts 的 CSV_TYPE_COLUMNS)。
 * 用法:server component / route handler 调 listCsvTypes / getCsvTypeByName,通过 props 传给 client 组件。
 */
import { prisma } from "@/lib/db";
import type { ColumnDef } from "@/lib/validation/csv-type";

export type CsvTypeOption = {
  name: string;
  label: string;
  columns: ColumnDef[];
};

type CsvTypeRow = { name: string; label: string; columns: unknown };

// 类型层小绕过:Prisma client 在 db:generate 之后才有 csvType 模型;
// 这里 cast 一下,运行时正常,typecheck 不再报。db:generate 跑完后可删 cast。
const prismaAny = prisma as unknown as {
  csvType: {
    findMany: (args: { orderBy: unknown; select: unknown }) => Promise<CsvTypeRow[]>;
    findUnique: (args: { where: { name: string }; select: unknown }) => Promise<CsvTypeRow | null>;
  };
};

/** 列表(按 name asc),给下拉用 */
export async function listCsvTypes(): Promise<CsvTypeOption[]> {
  const rows = await prismaAny.csvType.findMany({
    orderBy: { name: "asc" },
    select: { name: true, label: true, columns: true },
  });
  return rows.map((r) => ({
    name: r.name,
    label: r.label,
    columns: (r.columns as unknown as ColumnDef[]) ?? [],
  }));
}

/** 单条查找(给 server-side 校验等用) */
export async function getCsvTypeByName(name: string): Promise<CsvTypeOption | null> {
  const r = await prismaAny.csvType.findUnique({
    where: { name },
    select: { name: true, label: true, columns: true },
  });
  if (!r) return null;
  return {
    name: r.name,
    label: r.label,
    columns: (r.columns as unknown as ColumnDef[]) ?? [],
  };
}
