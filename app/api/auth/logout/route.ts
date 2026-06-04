import { route } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export const POST = route(async () => {
  clearSessionCookie();
  return Response.json({ ok: true });
});
