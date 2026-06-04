import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import type { ColumnDef } from "@/lib/validation/csv-type";

import CsvTypeForm from "../_components/CsvTypeForm";

export default async function EditCsvTypePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("ADMIN");
  const item = await prisma.csvType.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      label: true,
      description: true,
      columns: true,
    },
  });
  if (!item) nextNotFound();

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/admin/csv-types"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回 csvType 列表
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-lg font-semibold">
          编辑 csvType{" "}
          <span className="font-mono text-muted-foreground">{item.name}</span>
        </h1>
      </header>

      <CsvTypeForm
        mode="edit"
        initial={{
          id: item.id,
          name: item.name,
          label: item.label,
          description: item.description ?? "",
          columns: (item.columns as unknown as ColumnDef[]) ?? [],
        }}
      />
    </div>
  );
}
