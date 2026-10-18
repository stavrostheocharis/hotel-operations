import { schema, type Db } from "@/db";
import { scrubPii, scrubValue } from "@/normalize/pii";

/**
 * The one way signals enter the database: personal data is removed first
 * (free text and every string in the raw row, with the counts kept), and a
 * record already present (same property, source and external id) is left
 * alone. Shared by the synthetic loader and the import loader.
 */
export type SignalInsert = typeof schema.signals.$inferInsert;

export type InsertSummary = { rows: number; inserted: number; skipped: number; located: number; piiRows: number };

export async function insertSignalsScrubbed(
  db: Db,
  tenant: { groupId: string; propertyId: string },
  source: string,
  unscrubbed: SignalInsert[],
  batchId: string,
  log: (line: string) => void = () => {},
): Promise<InsertSummary> {
  let piiRows = 0;
  const rows: SignalInsert[] = unscrubbed.map((r) => {
    const redactions: Record<string, number> = {};
    const text = r.textOriginal ? scrubPii(r.textOriginal) : null;
    if (text) for (const [k, n] of Object.entries(text.redactions)) redactions[k] = (redactions[k] ?? 0) + n;
    const raw = scrubValue(r.raw ?? {}, redactions);
    const mapped = scrubValue(r.mapped ?? {}, redactions);
    const touched = Object.keys(redactions).length > 0;
    if (touched) piiRows++;
    return {
      ...r,
      textOriginal: text ? text.text : r.textOriginal,
      raw: raw.value,
      mapped: mapped.value,
      ...(touched ? { normalized: { ...(r.normalized ?? {}), pii_redactions: redactions } } : {}),
    };
  });
  if (piiRows) log(`${source}: personal data redacted in ${piiRows} rows`);
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const returned = await db
      .insert(schema.signals)
      .values(chunk)
      .onConflictDoNothing({ target: [schema.signals.propertyId, schema.signals.source, schema.signals.externalId] })
      .returning({ id: schema.signals.id });
    inserted += returned.length;
    if (returned.length) {
      await db.insert(schema.events).values(returned.map((r) => ({ ...tenant, entityType: "signal", entityId: r.id, type: "signal.created", payload: { source, batch_id: batchId } })));
    }
  }
  const located = rows.filter((r) => r.locationId).length;
  log(`${source}: ${rows.length} rows, ${inserted} inserted, ${rows.length - inserted} already present, ${located} located by exact/alias`);
  return { rows: rows.length, inserted, skipped: rows.length - inserted, located, piiRows };
}
