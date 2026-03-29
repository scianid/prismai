export type RagDocument = {
  id: string;
  project_id: string;
  title: string;
  chunk_count: number;
  created_at: string;
};

export type RagChunkMatch = {
  content: string;
  chunk_index: number;
};

/**
 * Insert a new RAG document (metadata only; chunks are inserted separately).
 */
export async function createRagDocument(
  supabase: any,
  projectId: string,
  title: string,
  sourceContent: string,
  chunkCount: number
): Promise<string> {
  const { data, error } = await supabase
    .from('rag_documents')
    .insert({ project_id: projectId, title, source_content: sourceContent, chunk_count: chunkCount })
    .select('id')
    .single();

  if (error) {
    console.error('ragDocumentDao: insert error', error);
    throw error;
  }

  return data.id as string;
}

/**
 * Insert all chunks for a document in a single batch insert.
 */
export async function insertRagChunks(
  supabase: any,
  documentId: string,
  projectId: string,
  chunks: Array<{ content: string; chunk_index: number; embedding: number[] }>
): Promise<void> {
  const rows = chunks.map(c => ({
    document_id: documentId,
    project_id: projectId,
    content: c.content,
    chunk_index: c.chunk_index,
    embedding: JSON.stringify(c.embedding) // pgvector accepts JSON array string
  }));

  const { error } = await supabase.from('rag_chunks').insert(rows);

  if (error) {
    console.error('ragDocumentDao: chunk insert error', error);
    throw error;
  }
}

/**
 * List non-deleted documents for a project (metadata only, no source content).
 */
export async function listRagDocuments(
  supabase: any,
  projectId: string
): Promise<RagDocument[]> {
  const { data, error } = await supabase
    .from('rag_documents')
    .select('id, project_id, title, chunk_count, created_at')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('ragDocumentDao: list error', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Soft-delete a document. Chunks are cascade-deleted at DB level via ON DELETE CASCADE.
 */
export async function softDeleteRagDocument(
  supabase: any,
  documentId: string,
  projectId: string
): Promise<boolean> {
  const { error, count } = await supabase
    .from('rag_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('project_id', projectId)  // scoped to project — prevent cross-tenant deletes
    .is('deleted_at', null)
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.error('ragDocumentDao: soft-delete error', error);
    throw error;
  }

  // Also delete chunks (soft-deleted documents shouldn't be retrieved but clean up anyway)
  await supabase.from('rag_chunks').delete().eq('document_id', documentId);

  return (count ?? 0) > 0;
}

/**
 * Find the top-K most similar chunks to the query embedding (cosine distance).
 * Uses pgvector's <=> operator via RPC.
 */
export async function searchSimilarChunks(
  supabase: any,
  projectId: string,
  queryEmbedding: number[],
  topK: number = 3
): Promise<RagChunkMatch[]> {
  const { data, error } = await supabase.rpc('match_rag_chunks', {
    p_project_id: projectId,
    p_embedding: JSON.stringify(queryEmbedding),
    p_match_count: topK
  });

  if (error) {
    console.error('ragDocumentDao: similarity search error', error);
    throw error;
  }

  return (data ?? []) as RagChunkMatch[];
}
