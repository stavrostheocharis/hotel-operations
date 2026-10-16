import { index, pgTable, text, unique, uuid, vector } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { signals } from "./signals";
import { tenantColumns } from "./tenant";

/**
 * Multilingual embeddings of signal text, one row per (signal, model).
 * Filled by the linking step; the HNSW index serves nearest-neighbour search.
 */
export const signalEmbeddings = pgTable(
  "signal_embeddings",
  {
    id: id(),
    ...tenantColumns(),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("signal_embeddings_signal_model_unique").on(t.signalId, t.model),
    index("signal_embeddings_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);
