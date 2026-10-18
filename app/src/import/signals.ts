import { sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { scrubPii, scrubValue } from "@/normalize/pii";

/**
 * The one way signals enter the database: personal data is removed first
 * (free text and every string in the raw row, with the counts kept). A
 * record already present (same property, source and external id) keeps
 * its first observation (`raw`, text, time: the immutability trigger) but
 * takes the new canonical record when it changed, so a ticket exported
 * open on Monday and closed on Wednesday closes here too; such rows are
 * normalised again. Shared by the synthetic loader and the import loader.
 */
export type SignalInsert = typeof schema.signals.$inferInsert;

/** rows = inserted + updated + skipped (unchanged). */
export type InsertSummary = { rows: number; inserted: number; updated: number; skipped: number; located: number; piiRows: number };

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
  let updated = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    // `xmax = 0` marks a freshly inserted row; an updated row carries the old transaction id.
    const returned = await db
      .insert(schema.signals)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.signals.propertyId, schema.signals.source, schema.signals.externalId],
        set: { mapped: sql`excluded.mapped`, normalizedAt: null },
        setWhere: sql`${schema.signals.mapped} is distinct from excluded.mapped`,
      })
      .returning({ id: schema.signals.id, fresh: sql<boolean>`(xmax = 0)` });
    const created = returned.filter((r) => r.fresh);
    const changed = returned.filter((r) => !r.fresh);
    inserted += created.length;
    updated += changed.length;
    if (created.length) {
      await db.insert(schema.events).values(created.map((r) => ({ ...tenant, entityType: "signal", entityId: r.id, type: "signal.created", payload: { source, batch_id: batchId } })));
    }
    if (changed.length) {
      await db.insert(schema.events).values(changed.map((r) => ({ ...tenant, entityType: "signal", entityId: r.id, type: "signal.updated", payload: { source, batch_id: batchId } })));
    }
  }
  const located = rows.filter((r) => r.locationId).length;
  const skipped = rows.length - inserted - updated;
  log(`${source}: ${rows.length} rows, ${inserted} inserted, ${updated} updated, ${skipped} unchanged, ${located} located by exact/alias`);
  return { rows: rows.length, inserted, updated, skipped, located, piiRows };
}
