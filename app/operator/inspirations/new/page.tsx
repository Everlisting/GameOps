/**
 * 运营端 · 新建创作灵感
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/rbac";
import InspirationForm from "../_components/InspirationForm";

export default async function NewInspirationPage() {
  await requireRole("OPERATOR");
  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/inspirations"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回灵感列表
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-lg font-semibold">新建创作灵感</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          视频教程 / 文档教程 / 创作素材;先选类型,字段会随之联动。
        </p>
      </header>

      <InspirationForm
        mode="create"
        initial={{
          type: "VIDEO_TUTORIAL",
          category: null,
          title: "",
          summary: "",
          content: "",
          url: "",
          coverImage: "",
          tags: [],
          published: true,
        }}
      />
    </div>
  );
}
