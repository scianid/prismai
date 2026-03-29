# AI Customization Feature

Allows per-project control over the chat assistant's **tone**, **guardrails**, and a **RAG knowledge base** (uploaded text documents injected as context at inference time).

---

## Architecture Overview

```
Admin UI (separate repo)
    │  Authorization: Bearer <supabase_jwt>
    ▼
 /project-ai-settings   ──►  project_ai_settings table
 /rag-documents          ──►  rag_documents + rag_chunks tables (pgvector)

Widget chat request
    │
    ▼  Promise.all
 getProjectById + getProjectAiSettings
    │
    ▼  only if aiSettings non-null
 generateEmbedding(question) → searchSimilarChunks (cosine, top-3)
    │
    ▼
 applyCustomization(aiMessages, { tone, guardrails, custom_instructions, ragChunks })
    │
    ▼
 streamAnswer → client
```

---

## Database Schema

### `project_ai_settings`
| Column | Type | Description |
|---|---|---|
| `project_id` | TEXT PK | FK → project |
| `tone` | TEXT | e.g. `"formal"`, `"friendly"`, or a free-text description |
| `guardrails` | JSONB | Array of rule strings the AI must follow |
| `custom_instructions` | TEXT | Free-form addendum appended to the system prompt |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `rag_documents`
| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | TEXT | FK → project |
| `title` | TEXT | Display name for the document |
| `source_content` | TEXT | Original uploaded text (max ~200 KB) |
| `chunk_count` | INT | Number of chunks created |
| `created_at` | TIMESTAMPTZ | |
| `deleted_at` | TIMESTAMPTZ | Soft-delete; NULL = active |

### `rag_chunks`
| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `document_id` | UUID | FK → rag_documents (CASCADE DELETE) |
| `project_id` | TEXT | Denormalised for fast filtering |
| `content` | TEXT | Chunk text (~1800 chars / ~450 tokens) |
| `chunk_index` | INT | Position within the document |
| `embedding` | vector(1536) | OpenAI `text-embedding-3-small` |
| `created_at` | TIMESTAMPTZ | |

RLS is **enabled** on all three tables with no permissive policies — direct client access is blocked. Edge functions access them via the service role key, which bypasses RLS.

---

## Edge Functions

### `POST /project-ai-settings`
Manage tone, guardrails and custom instructions. Auth: Supabase JWT.

**GET** `?project_id=<id>` — returns current settings (or defaults if none saved).

**PUT** `/` — upsert settings.
```json
{
  "project_id": "proj_abc123",
  "tone": "friendly",
  "guardrails": [
    "Never discuss competitor products",
    "Always recommend contacting support for billing issues"
  ],
  "custom_instructions": "Always end with a relevant follow-up question."
}
```
Response: the saved `project_ai_settings` row.

---

### `POST /rag-documents`
Manage the knowledge base. Auth: Supabase JWT.

**GET** `?project_id=<id>` — list active documents.
```json
{
  "documents": [
    { "id": "uuid", "title": "FAQ", "chunk_count": 12, "created_at": "..." }
  ]
}
```

**POST** `/` — upload a document. The function chunks the text, generates embeddings for each chunk, and stores them. Max content size: 200 KB.
```json
{
  "project_id": "proj_abc123",
  "title": "Product FAQ",
  "content": "Q: How do I reset my password?\nA: Click Forgot Password..."
}
```
Response:
```json
{ "id": "uuid", "chunk_count": 5 }
```

**DELETE** `/{document_id}?project_id=<id>` — soft-deletes the document and hard-deletes its chunks.

---

## How Customization Is Applied at Chat Time

In `functions/chat/index.ts`, after validating the request:

1. `getProjectById` and `getProjectAiSettings` run in parallel.
2. If `aiSettings` is `null` (no row for this project) → skip everything, prompt is unchanged (backwards-compatible).
3. If `aiSettings` exists → call `generateEmbedding(question)` then `searchSimilarChunks(top-3)`.
4. `applyCustomization(aiMessages, customization)` in `_shared/ai.ts`:
   - Appends tone/guardrails/custom_instructions to the **system message**.
   - Injects RAG chunks as a `<knowledge_base>` user message (sandboxed with injection-prevention note, same pattern as `<article_context>`).

---

## Admin UI Implementation Guide (separate repo)

### Authentication

All requests must include:
```
Authorization: Bearer <supabase_jwt>
```
Obtain the JWT from `supabase.auth.getSession()` after the user logs in. The backend verifies it with `supabase.auth.getUser(jwt)` and checks the caller is an owner or collaborator of the target project.

---

### Recommended Stack

- **Framework**: React / Next.js / Nuxt — any SPA or SSR framework works.
- **Supabase client**: `@supabase/supabase-js` for auth only (data goes through the custom edge functions, not direct DB queries).
- **File upload**: standard HTML `<textarea>` or a file input that reads the file as text (`.txt`, `.md`).

---

### UI Sections

#### 1. Tone

```
[ Preset picker ] + [ Custom textarea ]
Presets: Formal | Casual | Friendly | Professional | Neutral
```

- On select, populate a hidden `tone` field with the preset label, or let the user type a custom description.
- Save on blur or with an explicit Save button.

**API call on save:**
```js
await fetch(`${FUNCTIONS_URL}/project-ai-settings`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`
  },
  body: JSON.stringify({ project_id, tone })
})
```

#### 2. Guardrails

A dynamic list of rules. Each rule is a plain text string.

```
[ Rule 1 text input ]  [✕]
[ Rule 2 text input ]  [✕]
[ + Add rule ]
[ Save ]
```

**API call on save:**
```js
await fetch(`${FUNCTIONS_URL}/project-ai-settings`, {
  method: 'PUT',
  headers: { ... },
  body: JSON.stringify({ project_id, guardrails: ['rule1', 'rule2'] })
})
```

#### 3. Custom Instructions

A plain `<textarea>` for free-form instructions appended to the system prompt verbatim. Examples:
- "Always end with a follow-up question."
- "If the user mentions pricing, say 'Please speak to our sales team.'"

Saved via the same PUT endpoint:
```js
body: JSON.stringify({ project_id, custom_instructions: '...' })
```

> **Note:** The GET and PUT endpoints are independent — you can send only the fields you want to update. Fields omitted from PUT are replaced with the value in the request body, so always send the full current state of the object.

#### 4. Knowledge Base

**List view:**
```
Title          Chunks   Uploaded        Action
Product FAQ    12       Mar 29 2026     [Delete]
Onboarding     5        Mar 28 2026     [Delete]
[ Upload new document ]
```

**Upload flow:**
1. User pastes text into a textarea **or** picks a `.txt`/`.md` file (read with `FileReader.readAsText`).
2. Show a title input.
3. On submit:

```js
const response = await fetch(`${FUNCTIONS_URL}/rag-documents`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`
  },
  body: JSON.stringify({ project_id, title, content })
})
const { id, chunk_count } = await response.json()
```

4. Refresh the document list.

**Delete:**
```js
await fetch(`${FUNCTIONS_URL}/rag-documents/${documentId}?project_id=${project_id}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${jwt}` }
})
```

---

### Loading Initial State

On page load for a project, fetch both in parallel:

```js
const [settingsRes, docsRes] = await Promise.all([
  fetch(`${FUNCTIONS_URL}/project-ai-settings?project_id=${projectId}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  }),
  fetch(`${FUNCTIONS_URL}/rag-documents?project_id=${projectId}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  })
])

const settings = await settingsRes.json()   // { tone, guardrails, custom_instructions }
const { documents } = await docsRes.json()  // [{ id, title, chunk_count, created_at }]
```

---

### Error Handling

| Status | Meaning |
|---|---|
| 401 | Missing or invalid JWT — redirect to login |
| 403 | User is not an owner/collaborator of the project |
| 413 | Document content exceeds 200 KB limit — show size warning |
| 429 | Rate limited — show retry message |
| 500 | Server error — show generic error toast |

---

### Environment Variables (edge functions)

| Variable | Required for |
|---|---|
| `OPENAI_API_KEY` | Embeddings (`text-embedding-3-small`) and chat if provider = openai |
| `AI_PROVIDER` | `openai` or `deepseek` (default: `openai`) |
| `SUPABASE_URL` | Already set by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Already set by Supabase runtime |
