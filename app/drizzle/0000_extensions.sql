-- Extensions the schema depends on. pgvector backs signal_embeddings; pgcrypto
-- is present on pgvector/pgvector images but gen_random_uuid() is built in
-- since Postgres 13, so only vector is strictly required.
CREATE EXTENSION IF NOT EXISTS vector;
