import Link from "next/link";
import { Library } from "lucide-react";
import { getSession } from "@/lib/auth";
import { homePathForRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import InspirationLibrary from "@/components/inspirations/InspirationLibrary";
import type { InspirationSearchParams } from "@/lib/inspiration-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "创作灵感 · GameOps", description: "发现视频、图片、AI 提示词、故事脚本与创作教程。无需登录即可浏览创作资源。" };

export default async function PublicInspirationsPage({ searchParams }: { searchParams?: InspirationSearchParams }) {
  const session = await getSession();
  return <div className="inspiration-theme min-h-screen">
    <header className="border-b bg-card">
      <nav aria-label="主导航" className="mx-auto flex min-h-18 max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link href="/inspirations" className="flex items-center gap-3 font-semibold"><Library className="size-6 text-(--color-brand-primary)" /><span>GameOps <span className="ml-2 border-l pl-3 font-normal text-muted-foreground">创作库</span></span></Link>
        <Button asChild variant="outline"><Link href={session ? homePathForRole(session.role) : "/login"}>{session ? "进入工作台" : "登录 / 注册"}</Link></Button>
      </nav>
    </header>
    <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:py-12"><InspirationLibrary searchParams={searchParams} /></main>
    <footer className="mx-auto max-w-[1440px] px-5 py-8 text-sm text-(--color-text-tertiary) sm:px-8">GameOps 创作库 · 素材使用范围与来源请参阅资源说明。</footer>
  </div>;
}
