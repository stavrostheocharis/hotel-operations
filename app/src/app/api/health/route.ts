import { sql } from "drizzle-orm";
import { getAppDb } from "@/db";

/** For the container healthcheck and the load balancer: 200 when the database answers. */
export async function GET() {
  try {
    await getAppDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
