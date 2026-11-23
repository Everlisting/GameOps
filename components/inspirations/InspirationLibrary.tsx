import { readPublishedInspirations } from "@/lib/inspirations";
import type { InspirationSearchParams } from "@/lib/inspiration-catalog";
import InspirationBrowser from "./InspirationBrowser";

export default async function InspirationLibrary({ searchParams = {} }: { searchParams?: InspirationSearchParams }) {
  const data = await readPublishedInspirations(searchParams);
  return <InspirationBrowser {...data} />;
}
