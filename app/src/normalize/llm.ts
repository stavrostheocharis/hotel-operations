import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CATEGORIES, TOPICS } from "./taxonomy";

/**
 * The model-backed stage, behind an interface so the pipeline and the tests do
 * not depend on a network. Rules run first; these calls only see what the
 * rules could not settle. Every result is written to ai_suggestions with the
 * model and prompt version, so it can be audited and re-run.
 */

export type TranslateItem = { id: string; text: string; language: string | null };
export type TranslateResult = { id: string; textEn: string };

export type ClassifyItem = { id: string; text: string; source: string; hint?: string | null };
export type ClassifyResult = { id: string; category: string | null; topic: string | null; confidence: number };

export type LocateItem = { id: string; text: string; source: string };
export type LocateResult = { id: string; code: string | null; confidence: number };

export type JudgeSide = { source: string; date: string; location: string | null; topic: string | null; text: string | null };
export type JudgePair = { id: string; a: JudgeSide; b: JudgeSide; ruleHint: string };
export type JudgeResult = { id: string; verdict: "same" | "related" | "unrelated"; confidence: number; reason: string };

export interface LlmClient {
  readonly model: string;
  /** Model used for pair judgments (linking); may equal `model`. */
  readonly reasoningModel: string;
  readonly promptVersion: string;
  translate(items: TranslateItem[]): Promise<TranslateResult[]>;
  classify(items: ClassifyItem[]): Promise<ClassifyResult[]>;
  locate(items: LocateItem[], locations: { code: string; name: string; kind: string }[]): Promise<LocateResult[]>;
  /** Do two records describe the same underlying problem? */
  judgeLinks(pairs: JudgePair[]): Promise<JudgeResult[]>;
}

export const PROMPT_VERSION = "normalize-v1";
export const LINK_PROMPT_VERSION = "link-v1";

const SYSTEM = `You help a hotel operations team normalise guest and staff records.
Hotel context: a Greek luxury resort with buildings (wings), rooms, villas, pools, a spa, restaurants, a beach bar and shared equipment (boilers, chillers, lifts, pumps).
Texts may be English, German, French, Italian, Greek, Greeklish (Greek in Latin letters), Russian or Hebrew.
Be literal and conservative. Never invent facts that are not in the text.`;

export type OpenAiLlmOptions = {
  apiKey?: string;
  model?: string;
  reasoningModel?: string;
  batchSize?: number;
  concurrency?: number;
};

export function createOpenAiLlm(opts: OpenAiLlmOptions = {}): LlmClient {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const modelId = opts.model ?? process.env.OPENAI_MODEL_FAST ?? "gpt-5.4-mini";
  const reasoningModelId = opts.reasoningModel ?? process.env.OPENAI_MODEL_REASONING ?? "gpt-5.5";
  const openai = createOpenAI({ apiKey });
  const model = openai(modelId);
  const reasoningModel = openai(reasoningModelId);
  const batchSize = opts.batchSize ?? 20;
  const concurrency = opts.concurrency ?? 4;

  const call = async <T>(
    schema: z.ZodType<T>,
    prompt: string,
    which: "fast" | "reasoning" = "fast",
  ): Promise<T> => {
    const result = await generateObject({
      model: which === "fast" ? model : reasoningModel,
      schema,
      system: SYSTEM,
      prompt,
      maxRetries: 2,
      providerOptions: {
        openai: { reasoningEffort: which === "fast" ? "low" : "medium", textVerbosity: "low" },
      },
    });
    return result.object;
  };

  const batched = async <I extends { id: string }, O>(
    items: I[],
    run: (batch: I[]) => Promise<O[]>,
    size = batchSize,
  ): Promise<O[]> => {
    const batches: I[][] = [];
    for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
    const out: O[] = [];
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        out.push(...(await run(batch)));
      }
    });
    await Promise.all(workers);
    return out;
  };

  return {
    model: modelId,
    reasoningModel: reasoningModelId,
    promptVersion: PROMPT_VERSION,

    async judgeLinks(pairs) {
      const schema = z.object({
        items: z.array(
          z.object({
            id: z.string(),
            verdict: z.enum(["same", "related", "unrelated"]),
            confidence: z.number().min(0).max(1),
            reason: z.string(),
          }),
        ),
      });
      return batched(
        pairs,
        async (batch) => {
          const prompt = `Each item has two hotel records (a work order, a front-desk complaint, a survey comment or a review). Decide whether they describe the SAME underlying problem (one defect or one failing piece of equipment, reported more than once or by different people), a RELATED one (same place and kind of problem but plausibly a different fault), or UNRELATED. The rule that paired them is given as a hint; judge from the texts, places, topics and dates. Give a one-sentence reason.\n\n${JSON.stringify(batch)}`;
          const res = await call(schema, prompt, "reasoning");
          return res.items.map((r) => ({ id: r.id, verdict: r.verdict, confidence: r.confidence, reason: r.reason }));
        },
        10,
      );
    },

    async translate(items) {
      const schema = z.object({
        items: z.array(z.object({ id: z.string(), text_en: z.string() })),
      });
      return batched(items, async (batch) => {
        const prompt = `Translate each text to plain English. Keep room numbers, names of places and the meaning exactly; do not summarise or add anything. If a text is already English, return it unchanged.\n\n${JSON.stringify(
          batch.map((b) => ({ id: b.id, language: b.language ?? "unknown", text: b.text })),
        )}`;
        const res = await call(schema, prompt);
        return res.items.map((r) => ({ id: r.id, textEn: r.text_en }));
      });
    },

    async classify(items) {
      const topicList = Object.entries(TOPICS)
        .map(([k, v]) => `${k} (${v.category})`)
        .join(", ");
      const schema = z.object({
        items: z.array(
          z.object({
            id: z.string(),
            category: z.enum([...CATEGORIES, "none"]),
            topic: z.string().nullable(),
            confidence: z.number().min(0).max(1),
          }),
        ),
      });
      return batched(items, async (batch) => {
        const prompt = `Classify each record into exactly one category and, when one fits, one topic.\nCategories: ${CATEGORIES.join(", ")}, or "none" when the text reports no problem or request (e.g. praise, a neutral remark).\nTopics (with their category): ${topicList}. Use null for topic when none fits; never invent a new topic.\n"source" says where the record came from; "hint" is the drop-down value the hotel's own system assigned, which is wrong about a quarter of the time.\n\n${JSON.stringify(
          batch.map((b) => ({ id: b.id, source: b.source, hint: b.hint ?? null, text: b.text })),
        )}`;
        const res = await call(schema, prompt);
        return res.items.map((r) => ({
          id: r.id,
          category: r.category === "none" ? null : r.category,
          topic: r.topic && r.topic in TOPICS ? r.topic : null,
          confidence: r.confidence,
        }));
      });
    },

    async locate(items, locations) {
      const schema = z.object({
        items: z.array(
          z.object({
            id: z.string(),
            code: z.string().nullable(),
            confidence: z.number().min(0).max(1),
          }),
        ),
      });
      const catalogue = locations.map((l) => `${l.code} = ${l.name} [${l.kind}]`).join("\n");
      return batched(items, async (batch) => {
        const prompt = `For each record, pick the single location code from the catalogue that the text most specifically refers to (a room beats a floor, a floor beats a building, a piece of equipment beats the building it sits in). Return null when the text does not name a place.\n\nCatalogue:\n${catalogue}\n\nRecords:\n${JSON.stringify(
          batch.map((b) => ({ id: b.id, source: b.source, text: b.text })),
        )}`;
        const res = await call(schema, prompt);
        const known = new Set(locations.map((l) => l.code.toUpperCase()));
        return res.items.map((r) => ({
          id: r.id,
          code: r.code && known.has(r.code.toUpperCase()) ? r.code.toUpperCase() : null,
          confidence: r.confidence,
        }));
      });
    },
  };
}

/** Deterministic stand-in for tests and dry runs: translates by tagging, decides nothing. */
export function createFakeLlm(): LlmClient {
  return {
    model: "fake",
    reasoningModel: "fake",
    promptVersion: PROMPT_VERSION,
    async judgeLinks(pairs) {
      return pairs.map((p) => ({ id: p.id, verdict: "unrelated" as const, confidence: 0, reason: "fake judge" }));
    },
    async translate(items) {
      return items.map((i) => ({ id: i.id, textEn: `[${i.language ?? "?"}→en] ${i.text}` }));
    },
    async classify(items) {
      return items.map((i) => ({ id: i.id, category: null, topic: null, confidence: 0 }));
    },
    async locate(items) {
      return items.map((i) => ({ id: i.id, code: null, confidence: 0 }));
    },
  };
}
