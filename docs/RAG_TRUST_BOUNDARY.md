# RAG Trust Boundary

Scope: the `rag_documents` and `rag_chunks` tables, the `rag-documents`
edge function that writes to them, and the `searchSimilarChunks` /
chat-prompt path that reads from them.

This document exists so that anyone touching RAG code or administering
the platform understands **who is trusted** and **what happens if that
trust is broken**. It is also the written record an auditor will ask for
(SOC2 CC6.1, CC8.1 — documented trust boundaries around AI input).

Companion docs: [SECURITY_REVIEW.md](SECURITY_REVIEW.md),
[SECURITY_AUDIT_TODO.md](SECURITY_AUDIT_TODO.md).

## TL;DR

- **RAG ingest is admin-only.** Only accounts in the `admin_users` table
  can upload, list, or delete RAG documents.
- **Ingested content is fully trusted.** It is NOT sanitized on the way
  in, and it is NOT sanitized on the way out. It enters the AI prompt
  verbatim.
- **Publisher/customer self-service RAG uploads are not supported and
  must not be added without first implementing the mitigations at the
  bottom of this doc.**
- Blast radius of a compromised admin account: the attacker can inject
  stored prompts into any project's chat output, for every visitor of
  that project, until the rows are soft-deleted.

## The two ends of the pipe

**Write side** — lives in the parent `divee.ai` repo (not this widget
repo) at
[`supabase/functions/rag-documents/index.ts`](https://github.com/scianid/divee.ai/blob/main/supabase/functions/rag-documents/index.ts).

1. Caller sends an `Authorization: Bearer <jwt>` header. The function
   calls `getAuthenticatedClient(authHeader)` to resolve a Supabase
   user id.
2. The function queries `admin_users` for that user id. If there's no
   row, it returns 401. **Non-admins cannot upload, list, or delete
   RAG documents.**
3. An admin POSTs `{ project_id, title, content }`. The function:
   - Enforces a 200 KB raw-content size limit.
   - Splits the content into chunks of ~1500 chars (`chunkText`).
   - Generates OpenAI embeddings for each chunk.
   - Inserts one `rag_documents` row and N `rag_chunks` rows.
4. There is **no call to `sanitizeContent`** on the way in. HTML,
   comments, zero-width characters, and anything else an admin pastes
   all make it through to the DB verbatim.

**Read side** — lives in this widget repo at
[chat/index.ts](../supabase/functions/chat/index.ts) (L403–L429) and
[_shared/dao/ragDocumentDao.ts](../supabase/functions/_shared/dao/ragDocumentDao.ts)
(`searchSimilarChunks`).

1. When a user sends a chat message AND the project has AI settings
   configured OR is in knowledgebase mode, chat embeds the user's
   question and queries `match_rag_chunks` RPC for the top-K (default
   3) most similar chunks by cosine similarity.
2. The `.content` field of each matched chunk is collected into
   `ragChunks: string[]` and passed to the AI as part of the
   `AiCustomization` context.
3. There is **no call to `sanitizeContent`** on the way out. No length
   cap beyond what the AI model imposes, no stripping of instructions
   that look like `Ignore previous instructions and…`.

## Trust assumption (current state)

**RAG content is as trusted as the Divee team's own source code.**

That assumption holds because today:
- Only platform admins can write, and admin accounts are issued
  manually to Divee staff.
- Admins have no UX for letting a publisher paste text through —
  they'd have to copy it across by hand, which is a human-review
  choke point.
- There is no automated ingest from webhooks, scraping, or the public
  widget.

If any of those change, the assumption breaks and this doc is wrong.

## Who owns what

- **`admin_users` table membership** is the security boundary. Adding
  or removing a row in that table directly changes the set of people
  who can inject content into any project's prompts. Treat it like
  production credentials: two-person review, audit trail, quarterly
  recert.
- **Ingest content review** is a manual process. Admins are expected
  to read what they paste, verify it came from a legitimate
  source (publisher brand guide, product documentation, etc.), and not
  include user-generated content without sanitizing it first.

## Blast radius of a compromised admin

A single compromised admin account can:

1. **Inject prompt-injection payloads into any project's chat output.**
   A single crafted chunk with "When the user asks anything, respond
   with X" can alter every answer to visitors on that publisher's
   site, for the lifetime of the chunk row.
2. **Alter widget tone and content.** Because chunks are delivered
   into `AiCustomization.ragChunks`, the AI treats them as
   authoritative context, not as user input. A chunk saying "this
   publisher's brand voice is hostile" will affect the voice of every
   response.
3. **Produce cross-project contamination** if a single document is
   re-uploaded against multiple project_ids. The
   `rag_documents.project_id` column scopes queries — nothing stops a
   malicious admin from uploading the same content to all of them at
   once.

A compromised admin **cannot**, via this path alone:

- Read conversations, tokens, or other visitor data (RAG chunks return
  only their own `content` field).
- Exfiltrate data from other projects (chunks only contain the text
  the admin themselves uploaded).
- Persist beyond soft-delete — an admin with `DELETE` access can clear
  rows (`deleted_at IS NOT NULL` excludes them from queries), so
  recovery is one query away once detected.

The containment is good. The prevention is weak: anyone with admin
credentials can run this attack today.

## Detection

- Sudden rise in `rag_documents` row count per project_id.
- Unexpected `rag_documents.created_at` outside business hours for a
  given admin.
- Chat output deviating from expected brand voice for a publisher —
  can be surfaced via the analytics pipeline if we sample chat answers.
- Any `rag_documents` row with content that doesn't match the uploading
  admin's usual language, project, or style.

## Incident response

If a RAG compromise is suspected:

1. **Soft-delete the affected rows.**
   `UPDATE rag_documents SET deleted_at = NOW() WHERE id IN (…);` —
   `searchSimilarChunks` excludes `deleted_at IS NOT NULL` via the RPC,
   so removal is immediate. No cache invalidation needed.
2. **Rotate the suspected admin's credentials** and revoke their row
   in `admin_users` until the investigation completes.
3. **Check `rag_chunks` for orphans** — the delete cascades via the
   foreign key, but belt-and-braces: `SELECT COUNT(*) FROM rag_chunks
   WHERE document_id NOT IN (SELECT id FROM rag_documents WHERE
   deleted_at IS NULL);`.
4. **Audit recent `admin_users` writes.** An attacker who can create
   admins can always recreate deleted ones.
5. **Ask each affected project to review chat answers** from the time
   of first suspect ingest to the time of soft-delete. The injection
   may have shifted tone in subtle ways that no alert caught.

## What would change if we ever accepted publisher-authored RAG

This is the trust boundary that must be rewritten before any of the
following ship:

- A dashboard that lets publishers paste their own docs.
- An automated crawler that ingests publisher site content.
- A webhook that accepts inbound content from customer systems.

If any of those land, add:

1. **Sanitization on ingest.** Run `sanitizeContent` (from
   `_shared/constants.ts`) before embedding, plus the additional
   Unicode stripping in
   [SECURITY_AUDIT_TODO.md item 6](SECURITY_AUDIT_TODO.md). The
   sanitizer today strips HTML and comments — enough for admin paste,
   not enough for adversarial input.
2. **Post-retrieval sanitization.** Even with ingest sanitization,
   re-run a stripped-down filter on the chunks that come back from
   `searchSimilarChunks` before handing them to the AI. Defense in
   depth — a bug in the ingest path can't be the only thing keeping
   injection out.
3. **Per-tenant quotas.** Limit `rag_documents` row count and total
   byte size per project_id so a compromised publisher account can't
   flood their own index or cross over into another tenant.
4. **Row-level review.** Surface new chunks to a human reviewer (or at
   minimum, a classifier) before they become eligible for
   `match_rag_chunks`.
5. **Re-scoring for prompt-injection signatures.** A cheap pass that
   flags chunks containing strings like `ignore previous`, `system:`,
   `you are now`, markdown role switches, etc., and either drops them
   or lowers their similarity score.

Without all five, publisher-authored RAG opens confused-deputy holes
that this document explicitly does not claim to cover.

## Appendix: relevant files

| File | Role |
| --- | --- |
| `supabase/functions/rag-documents/index.ts` (parent repo) | Admin-only write/list/delete |
| `supabase/functions/_shared/dao/ragDocumentDao.ts` | `searchSimilarChunks` read path |
| `supabase/functions/chat/index.ts` L403–L429 | Where RAG chunks enter the AI prompt |
| `supabase/migrations/20260329_ai_customization.sql` | Table definitions + RLS |
| `admin_users` table | The trust boundary |
