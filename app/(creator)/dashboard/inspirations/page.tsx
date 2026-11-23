import { requireCreator } from "@/lib/creator";
import InspirationLibrary from "@/components/inspirations/InspirationLibrary";
import type { InspirationSearchParams } from "@/lib/inspiration-catalog";

export default async function InspirationsPage({ searchParams }: { searchParams?: InspirationSearchParams }) {
  await requireCreator();
  return <div className="inspiration-theme min-h-full p-5 sm:p-8"><InspirationLibrary searchParams={searchParams} /></div>;
}
