import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { findProperty } from "@/db/scripts/seed";
import { detectLanguage } from "./language";
import { inferLocation, LocationIndex, type LocationHit, type LocationRow } from "./location-rules";
import type { LlmClient } from "./llm";
import { classifyText, TOPICS } from "./taxonomy";

/**
 * Normalisation: fill the derived columns of `signals` from the immutable
 * observation. Stages, in order, each only touching what the previous one
 * left open:
 *
 *   1. language        franc + Greeklish heuristic
 *   2. place           where the record was typed or where the guest stayed:
 *                      exact/alias (loader) → rules → survey via stay → LLM
 *   3. category/topic  keyword rules + drop-down hints → LLM
 *   4. location        the place, moved by the topic's scope: a breakfast
 *                      complaint from room 312 is located at the restaurant,
 *                      a lift complaint at the building's lift
 *   5. translation     LLM, non-English text only
 *
 * The LLM is optional. Without it, everything the rules could not settle is
 * left null and reported, so the gap is visible rather than guessed.
 */

export const NORMALIZE_VERSION = "rules-v2";

export type NormalizeOptions = {
  propertyCode?: string;
  llm?: LlmClient | null;
  /** Re-process rows that were normalised before. */
  all?: boolean;
  limit?: number;
  pageSize?: number;
  log?: (msg: string) => void;
};

export type NormalizeResult = {
  processed: number;
  language: Record<string, number>;
  locationMethod: Record<string, number>;
  classification: Record<string, number>;
  translated: number;
  llmCalls: { translate: number; classify: number; locate: number };
};

type SignalRow = {
  id: string;
  source: (typeof schema.signalSource.enumValues)[number];
  externalId: string;
  textOriginal: string | null;
  textEn: string | null;
  language: string | null;
  stayRef: string | null;
  locationId: string | null;
  locationMethod: (typeof schema.locationMethod.enumValues)[number];
  raw: Record<string, unknown>;
  mapped: Record<string, unknown>;
  normalized: Record<string, unknown>;
  lockedFields: string[];
};

type Place = { code: string; method: LocationHit["method"] | "stay" | "llm"; confidence: number; rule: string };

/** Topics whose symptom lives at a building's shared equipment rather than in the room. */
const TOPIC_EQUIPMENT: Record<string, string> = { elevator_stuck: "LIFT-1" };

export async function normalizeSignals(db: Db, opts: NormalizeOptions = {}): Promise<NormalizeResult> {
  const log = opts.log ?? (() => {});
  const property = await findProperty(db, opts.propertyCode ?? "ASTRAEA");
  if (!property) throw new Error("property not seeded; run db:seed first");
  const tenant = { groupId: property.groupId, propertyId: property.id };

  const locationRows = (await db
    .select({
      id: schema.locations.id,
      code: schema.locations.code,
      kind: schema.locations.kind,
      name: schema.locations.name,
      aliases: schema.locations.aliases,
      attributes: schema.locations.attributes,
    })
    .from(schema.locations)
    .where(eq(schema.locations.propertyId, property.id))) as (LocationRow & { name: string })[];
  const index = new LocationIndex(locationRows);
  const codeOfId = new Map(locationRows.map((l) => [l.id, l.code]));

  // stay_ref → room code, from the PMS signals (surveys carry no room).
  const stayRooms = new Map<string, string>();
  const pms = await db
    .select({ stayRef: schema.signals.stayRef, locationId: schema.signals.locationId })
    .from(schema.signals)
    .where(and(eq(schema.signals.propertyId, property.id), eq(schema.signals.source, "pms")));
  for (const s of pms) {
    const code = s.locationId ? codeOfId.get(s.locationId) : undefined;
    if (s.stayRef && code) stayRooms.set(s.stayRef, code);
  }

  const result: NormalizeResult = {
    processed: 0,
    language: {},
    locationMethod: {},
    classification: {},
    translated: 0,
    llmCalls: { translate: 0, classify: 0, locate: 0 },
  };
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

  const pageSize = opts.pageSize ?? 1000;
  let remaining = opts.limit ?? Number.POSITIVE_INFINITY;
  let lastId: string | null = null;

  while (remaining > 0) {
    const conditions = [eq(schema.signals.propertyId, property.id)];
    if (!opts.all) conditions.push(isNull(schema.signals.normalizedAt));
    if (lastId) conditions.push(sql`${schema.signals.id} > ${lastId}`);
    const page = (await db
      .select({
        id: schema.signals.id,
        source: schema.signals.source,
        externalId: schema.signals.externalId,
        textOriginal: schema.signals.textOriginal,
        textEn: schema.signals.textEn,
        language: schema.signals.language,
        stayRef: schema.signals.stayRef,
        locationId: schema.signals.locationId,
        locationMethod: schema.signals.locationMethod,
        lockedFields: schema.signals.lockedFields,
        mapped: schema.signals.mapped,
        raw: schema.signals.raw,
        normalized: schema.signals.normalized,
      })
      .from(schema.signals)
      .where(and(...conditions))
      .orderBy(schema.signals.id)
      .limit(Math.min(pageSize, remaining))) as SignalRow[];
    if (!page.length) break;
    lastId = page[page.length - 1].id;
    remaining -= page.length;

    const updates = new Map<string, Partial<typeof schema.signals.$inferInsert>>();
    const places = new Map<string, Place | null>();
    const topics = new Map<string, string | null>();
    const needTranslate: { id: string; text: string; language: string | null }[] = [];
    const needClassify: { id: string; text: string; source: string; hint?: string | null }[] = [];
    const needLocate: { id: string; text: string; source: string }[] = [];

    for (const s of page) {
      const text = s.textOriginal ?? "";
      const norm: Record<string, unknown> = { ...(s.normalized ?? {}), version: NORMALIZE_VERSION };
      const upd: Partial<typeof schema.signals.$inferInsert> = {};

      // 1. language
      const lang = detectLanguage(text);
      if (lang.language) {
        upd.language = lang.language;
        upd.languageConfidence = lang.confidence.toFixed(3);
        norm.language_method = lang.method;
      }
      bump(result.language, lang.language ?? "none");

      // 2. place
      let place: Place | null = null;
      if (s.locationId && s.locationMethod !== "none") {
        const code = codeOfId.get(s.locationId);
        if (code) place = { code, method: s.locationMethod as Place["method"], confidence: 1, rule: "loader" };
      }
      if (!place) {
        if (s.source === "work_order" || s.source === "front_desk" || s.source === "staff_report" || s.source === "guest_qr") {
          const hit = inferLocation(typedLocation(s), freeTextFor(s), index);
          if (hit) place = hit;
          else if (opts.llm && text) {
            needLocate.push({ id: s.id, text: [typedLocation(s), freeTextFor(s)].filter(Boolean).join(" | "), source: s.source });
          }
        } else if (s.source === "survey" || s.source === "review") {
          // Guests rarely name a place precisely; accept only explicit rooms,
          // villas or equipment, keep buildings as a hint, and otherwise fall
          // back to the room of the stay.
          const hit = inferLocation(null, text, index);
          if (hit && (index.rooms.has(hit.code) || index.equipment.has(hit.code))) place = hit;
          else if (hit && index.buildings.has(hit.code)) norm.building_hint = hit.code;
          if (!place && s.stayRef && stayRooms.has(s.stayRef)) {
            place = { code: stayRooms.get(s.stayRef)!, method: "stay", confidence: 0.9, rule: "stay→room" };
          }
        }
      }
      places.set(s.id, place);

      // 3. classification
      const hints = {
        woCategory: s.source === "work_order" ? field(s, "category", "Category") : null,
        fdDepartment: s.source === "front_desk" ? field(s, "department", "Dept") : null,
      };
      const cls = classifyText(text, hints);
      if (cls.category) upd.category = cls.category;
      if (cls.topic) upd.topic = cls.topic;
      topics.set(s.id, cls.topic);
      norm.classification = { method: cls.method, confidence: cls.confidence, topics: cls.evidence.topics };
      if (cls.method !== "rules" && opts.llm && text.length >= 8) {
        needClassify.push({ id: s.id, text, source: s.source, hint: hints.woCategory ?? hints.fdDepartment });
        bump(result.classification, "pending-llm");
      } else {
        bump(result.classification, cls.method);
      }

      // 5. translation
      if (opts.llm && text && lang.language && lang.language !== "en" && !s.textEn) {
        needTranslate.push({ id: s.id, text, language: lang.language });
      }

      upd.normalized = norm;
      upd.normalizedAt = new Date();
      updates.set(s.id, upd);
    }

    // LLM stage, batched, results applied on top of the rules.
    if (opts.llm) {
      const llm = opts.llm;
      const suggestions: (typeof schema.aiSuggestions.$inferInsert)[] = [];
      const suggest = (
        kind: (typeof schema.suggestionKind.enumValues)[number],
        id: string,
        output: Record<string, unknown>,
        confidence: number | null,
        accepted: boolean,
      ) =>
        suggestions.push({
          ...tenant,
          kind,
          inputRefs: { signal_id: id },
          output,
          model: llm.model,
          promptVersion: llm.promptVersion,
          confidence: confidence === null ? null : confidence.toFixed(3),
          decision: accepted ? "accepted" : "rejected",
          decidedBy: "system",
          decidedAt: new Date(),
        });

      if (needTranslate.length) {
        const res = await llm.translate(needTranslate);
        result.llmCalls.translate += needTranslate.length;
        for (const r of res) {
          const upd = updates.get(r.id);
          if (!upd) continue;
          upd.textEn = r.textEn;
          result.translated++;
          suggest("translate", r.id, { text_en: r.textEn }, null, true);
        }
      }
      if (needClassify.length) {
        const res = await llm.classify(needClassify);
        result.llmCalls.classify += needClassify.length;
        for (const r of res) {
          const upd = updates.get(r.id);
          if (!upd) continue;
          if (r.category) upd.category = r.category;
          if (r.topic) {
            upd.topic = r.topic;
            topics.set(r.id, r.topic);
          }
          upd.normalized = {
            ...(upd.normalized as Record<string, unknown>),
            classification: { method: "llm", confidence: r.confidence, category: r.category, topic: r.topic },
          };
          suggest("classify", r.id, { category: r.category, topic: r.topic }, r.confidence, true);
        }
      }
      if (needLocate.length) {
        const catalogue = locationRows
          .filter((l) => l.kind !== "room")
          .map((l) => ({ code: l.code, name: l.name, kind: l.kind }));
        const res = await llm.locate(needLocate, catalogue);
        result.llmCalls.locate += needLocate.length;
        for (const r of res) {
          const accepted = Boolean(r.code && index.has(r.code));
          if (accepted) places.set(r.id, { code: r.code!, method: "llm", confidence: r.confidence, rule: "llm" });
          suggest("locate", r.id, { code: r.code }, r.confidence, accepted);
        }
      }
      for (let i = 0; i < suggestions.length; i += 500) {
        await db.insert(schema.aiSuggestions).values(suggestions.slice(i, i + 500));
      }
    }

    // 4. final location = place moved by the topic's scope.
    for (const s of page) {
      const upd = updates.get(s.id)!;
      const norm = upd.normalized as Record<string, unknown>;
      const place = places.get(s.id) ?? null;
      const topic = topics.get(s.id) ?? null;
      let final: Place | null = place;

      const facility = topic ? TOPICS[topic]?.defaultLocation : undefined;
      const equipmentSuffix = topic ? TOPIC_EQUIPMENT[topic] : undefined;
      const placeIsRoomish = !place || index.rooms.has(place.code) || index.floors.has(place.code) || index.buildings.has(place.code);
      if (facility && placeIsRoomish && index.has(facility)) {
        final = { code: facility, method: "inferred", confidence: 0.75, rule: `topic-facility:${topic}` };
      } else if (equipmentSuffix && placeIsRoomish) {
        const building = place ? buildingOf(place.code, index) : null;
        const code = building ? `${building}-${equipmentSuffix}` : null;
        if (code && index.has(code)) {
          final = { code, method: "inferred", confidence: 0.7, rule: `topic-equipment:${topic}` };
        }
      }
      if (place && final && final.code !== place.code) norm.place = place.code;

      if (final && final.rule !== "loader") {
        upd.locationId = index.idOf(final.code)!;
        upd.locationMethod = final.method;
        upd.locationConfidence = final.confidence.toFixed(3);
        norm.location_rule = final.rule;
      }
      bump(result.locationMethod, final ? final.method : "none");
    }

    // Write back and log events, one transaction per page. Fields a person
    // set by hand (signals.locked_fields) are left alone.
    const lockedOf = new Map(page.map((s) => [s.id, new Set(s.lockedFields ?? [])]));
    await db.transaction(async (tx) => {
      for (const [id, upd] of updates) {
        const locked = lockedOf.get(id);
        if (locked?.size) {
          if (locked.has("category") || locked.has("topic")) {
            delete upd.category;
            delete upd.topic;
          }
          if (locked.has("location")) {
            delete upd.locationId;
            delete upd.locationMethod;
            delete upd.locationConfidence;
          }
        }
        await tx.update(schema.signals).set(upd).where(eq(schema.signals.id, id));
      }
      await tx.insert(schema.events).values(
        [...updates.entries()].map(([id, upd]) => ({
          ...tenant,
          entityType: "signal",
          entityId: id,
          type: "signal.normalized",
          payload: {
            language: upd.language ?? null,
            location_method: upd.locationMethod ?? null,
            category: upd.category ?? null,
            topic: upd.topic ?? null,
            translated: Boolean(upd.textEn),
          },
        })),
      );
    });
    result.processed += page.length;
    log(`normalised ${result.processed} signals`);
  }
  return result;
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** The data request's field from `mapped` (any export), else the synthetic export's own column. */
function field(s: SignalRow, key: string, legacy: string): string | null {
  const m = s.mapped?.[key];
  if (m !== null && m !== undefined && m !== "") return String(m);
  return str(s.raw[legacy]);
}

function typedLocation(s: SignalRow): string | null {
  if (s.source === "work_order") return field(s, "location", "Location");
  if (s.source === "front_desk" || s.source === "compensation") return field(s, "room", "Room");
  return null;
}

function freeTextFor(s: SignalRow): string | null {
  if (s.source === "front_desk") {
    return [s.textOriginal, field(s, "agent_note", "Agent note")].filter(Boolean).join(" | ") || null;
  }
  return s.textOriginal;
}

/** Building code for a room ("312" → "A"), floor ("B/3" → "B") or building. */
function buildingOf(code: string, index: LocationIndex): string | null {
  const upper = code.toUpperCase();
  if (index.buildings.has(upper)) return upper;
  if (index.floors.has(upper)) return upper.split("/")[0];
  const row = index.byCode.get(upper);
  const b = row?.attributes?.building;
  return typeof b === "string" && index.buildings.has(b.toUpperCase()) ? b.toUpperCase() : null;
}

/** Reset derived columns so a run can be repeated from scratch (tests). */
export async function resetNormalization(db: Db, propertyId: string, sources?: SignalRow["source"][]) {
  const where = sources
    ? and(eq(schema.signals.propertyId, propertyId), inArray(schema.signals.source, sources))
    : eq(schema.signals.propertyId, propertyId);
  await db
    .update(schema.signals)
    .set({
      language: null,
      languageConfidence: null,
      textEn: null,
      category: null,
      topic: null,
      normalized: {},
      normalizedAt: null,
    })
    .where(where);
}
