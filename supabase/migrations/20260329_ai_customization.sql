-- AI customization: tone, guardrails, and RAG per project

-- Per-project AI personality settings
CREATE TABLE IF NOT EXISTS project_ai_settings (
    project_id TEXT PRIMARY KEY REFERENCES project(project_id) ON DELETE CASCADE,
    tone TEXT,                        -- e.g. "formal", "friendly", or a free-text description
    guardrails JSONB DEFAULT '[]',    -- string[] of rules the AI must follow
    custom_instructions TEXT,         -- free-form extra system prompt addendum
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE project_ai_settings ENABLE ROW LEVEL SECURITY;

-- RAG document store (one document = one uploaded text blob)
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_content TEXT NOT NULL,
    chunk_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ          -- soft delete
);

CREATE INDEX IF NOT EXISTS rag_documents_project_id_idx ON rag_documents(project_id) WHERE deleted_at IS NULL;

ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;

-- RAG chunks with vector embeddings (text-embedding-3-small → 1536 dims)
CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,        -- denormalised for fast filtering
    content TEXT NOT NULL,
    chunk_index INT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_chunks_project_id_idx ON rag_chunks(project_id);

-- ivfflat index for approximate nearest-neighbour cosine search
-- lists=100 is a reasonable default for up to ~1M rows; tune up if needed.
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_cosine_idx
    ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;

-- RPC: find top-K chunks most similar to the query embedding (cosine)
CREATE OR REPLACE FUNCTION match_rag_chunks(
    p_project_id TEXT,
    p_embedding vector(1536),
    p_match_count INT DEFAULT 3
)
RETURNS TABLE (
    content TEXT,
    chunk_index INT
)
LANGUAGE sql STABLE
AS $$
    SELECT content, chunk_index
    FROM rag_chunks
    WHERE project_id = p_project_id
    ORDER BY embedding <=> p_embedding
    LIMIT p_match_count;
$$;
