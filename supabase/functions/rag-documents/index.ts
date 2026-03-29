import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminAccess } from '../_shared/adminAuth.ts';
import { createRagDocument, insertRagChunks, listRagDocuments, softDeleteRagDocument } from '../_shared/dao/ragDocumentDao.ts';
import { chunkText } from '../_shared/ragChunker.ts';
import { generateEmbedding } from '../_shared/embeddingService.ts';

const MAX_SOURCE_CONTENT_BYTES = 200_000; // ~50KB in UTF-8; guards against huge uploads

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = await supabaseClient();
    const authHeader = req.headers.get('Authorization');
    const url = new URL(req.url);

    // DELETE /rag-documents/{id}?project_id=xxx
    if (req.method === 'DELETE') {
      const documentId = url.pathname.split('/').filter(Boolean).pop();
      const projectId = url.searchParams.get('project_id');

      if (!documentId || !projectId) {
        return jsonResp({ error: 'Missing document id or project_id' }, 400);
      }

      await verifyAdminAccess(supabase, authHeader, projectId);

      const deleted = await softDeleteRagDocument(supabase, documentId, projectId);
      if (!deleted) return jsonResp({ error: 'Document not found' }, 404);
      return jsonResp({ success: true });
    }

    // GET /rag-documents?project_id=xxx
    if (req.method === 'GET') {
      const projectId = url.searchParams.get('project_id');
      if (!projectId) return jsonResp({ error: 'Missing project_id' }, 400);

      await verifyAdminAccess(supabase, authHeader, projectId);

      const docs = await listRagDocuments(supabase, projectId);
      return jsonResp({ documents: docs });
    }

    // POST /rag-documents  { project_id, title, content }
    if (req.method === 'POST') {
      const body = await req.json();
      const { project_id, title, content } = body;

      if (!project_id || !title || !content) {
        return jsonResp({ error: 'Missing project_id, title, or content' }, 400);
      }

      if (typeof content !== 'string' || content.length === 0) {
        return jsonResp({ error: 'content must be a non-empty string' }, 400);
      }

      // Guard large uploads
      const contentByteLength = new Blob([content]).size;
      if (contentByteLength > MAX_SOURCE_CONTENT_BYTES) {
        return jsonResp({ error: `Content exceeds ${MAX_SOURCE_CONTENT_BYTES / 1000}KB limit` }, 413);
      }

      await verifyAdminAccess(supabase, authHeader, project_id);

      // 1. Split into chunks
      const textChunks = chunkText(content);
      if (textChunks.length === 0) {
        return jsonResp({ error: 'Content produced no chunks after splitting' }, 400);
      }

      // 2. Create the document row (gets us an id for FK)
      const documentId = await createRagDocument(supabase, project_id, title, content, textChunks.length);

      // 3. Generate embeddings for all chunks in parallel
      const embeddings = await Promise.all(
        textChunks.map(chunk => generateEmbedding(chunk))
      );

      // 4. Batch-insert all chunks
      const chunkRows = textChunks.map((chunk, i) => ({
        content: chunk,
        chunk_index: i,
        embedding: embeddings[i]
      }));

      await insertRagChunks(supabase, documentId, project_id, chunkRows);

      return jsonResp({ id: documentId, chunk_count: textChunks.length }, 201);
    }

    return jsonResp({ error: 'Method not allowed' }, 405);
  } catch (err: unknown) {
    // verifyAdminAccess throws a Response directly
    if (err instanceof Response) return err;
    console.error('rag-documents: unhandled error', err);
    return jsonResp({ error: 'Internal server error' }, 500);
  }
});

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
