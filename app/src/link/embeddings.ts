import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";

/**
 * Multilingual embeddings of signal text, stored in signal_embeddings
 * (pgvector, 1024 dims). Used only to settle the pairs the rules left in the
 * gray zone; the rules never need them.
 */

export const EMBEDDING_DIMENSIONS = 1024;

export function embeddingModelId(): string {
  return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large";
}

export async function embedSignals(
  db: Db,
  opts: { propertyId: string; apiKey?: string; model?: string; batchSize?: number; log?: (m: string) => void },
): Promise<{ embedded: number; model: string }> {
  const log = opts.log ?? (() => {});
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const modelId = opts.model ?? embeddingModelId();
  const openai = createOpenAI({ apiKey });
  const model = openai.textEmbeddingModel(modelId);
  const batchSize = opts.batchSize ?? 96;

  const rows = await db
    .select({
      id: schema.signals.id,
      groupId: schema.signals.groupId,
      text: sql<string>`coalesce(${schema.signals.textEn}, ${schema.signals.textOriginal})`,
    })
    .from(schema.signals)
    .leftJoin(
      schema.signalEmbeddings,
      and(eq(schema.signalEmbeddings.signalId, schema.signals.id), eq(schema.signalEmbeddings.model, modelId)),
    )
    .where(
      and(
        eq(schema.signals.propertyId, opts.propertyId),
        isNotNull(schema.signals.textOriginal),
        sql`${schema.signalEmbeddings.id} is null`,
        sql`${schema.signals.source} <> 'pms'`,
      ),
    );
  log(`${rows.length} signals to embed with ${modelId}`);

  let embedded = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.filter((r) => r.text && r.text.trim()).slice(i, i + batchSize);
    if (!batch.length) continue;
    const { embeddings } = await embedMany({
      model,
      values: batch.map((r) => r.text.slice(0, 4000)),
      dimensions: EMBEDDING_DIMENSIONS,
      maxRetries: 2,
    });
    await db
      .insert(schema.signalEmbeddings)
      .values(
        batch.map((r, k) => ({
          groupId: r.groupId,
          propertyId: opts.propertyId,
          signalId: r.id,
          model: modelId,
          embedding: embeddings[k],
        })),
      )
      .onConflictDoNothing();
    embedded += batch.length;
    log(`embedded ${embedded}/${rows.length}`);
  }
  return { embedded, model: modelId };
}

export async function loadEmbeddings(db: Db, propertyId: string, modelId = embeddingModelId()): Promise<Map<string, Float32Array>> {
  const rows = await db
    .select({ signalId: schema.signalEmbeddings.signalId, embedding: schema.signalEmbeddings.embedding })
    .from(schema.signalEmbeddings)
    .where(and(eq(schema.signalEmbeddings.propertyId, propertyId), eq(schema.signalEmbeddings.model, modelId)));
  return new Map(rows.map((r) => [r.signalId, Float32Array.from(r.embedding)]));
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
