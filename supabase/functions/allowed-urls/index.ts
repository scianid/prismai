import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { errorResp, successRespWithCache } from "../_shared/responses.ts";
import { getProjectById } from "../_shared/dao/projectDao.ts";
import { encryptAllowlist } from "../_shared/allowlistCipher.ts";
import { captureException, serveWithSentry } from "../_shared/sentry.ts";

// GET /allowed-urls?projectId=<id>
//
// Returns the project's `allowed_urls`, AES-GCM encrypted, as
// `{ data: "<base64>" }`.
//
// Purpose-built for the secondary analytics service: it needs the allowlist
// to decide whether to persist an event, but runs at high traffic. So this
// endpoint is public and CDN-cached (the cache absorbs that traffic — config
// lookups no longer scale per analytics beacon), and the payload is encrypted
// so a world-readable shared cache entry still leaks nothing. See
// _shared/allowlistCipher.ts.
//
// An unknown/missing project returns an encrypted EMPTY array — there is no
// separate "exists" flag. The consumer treats empty as "allow nothing", which
// is the correct fail-closed behavior for analytics persistence.

// projectId is reflected into the per-project Surrogate-Key header — constrain
// it to a safe charset so it can never inject a header value, and so a
// malformed id is cheaply rejected before any DB work.
const SAFE_PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;

// ─── Dependency injection seam ────────────────────────────────────────────
// Mirrors config/analytics/chat: handler takes a deps object so unit tests
// can stub the DB lookup and the cipher without touching the network/crypto.
export interface AllowedUrlsDeps {
  supabaseClient: typeof supabaseClient;
  getProjectById: typeof getProjectById;
  encryptAllowlist: typeof encryptAllowlist;
}

export const realAllowedUrlsDeps: AllowedUrlsDeps = {
  supabaseClient,
  getProjectById,
  encryptAllowlist,
};

export async function allowedUrlsHandler(
  req: Request,
  deps: AllowedUrlsDeps = realAllowedUrlsDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return errorResp("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return errorResp("Missing projectId", 400);
    }

    // Resolve allowed_urls. A malformed id, an unknown project, or any DB
    // error all collapse to an empty list — encrypted and returned the same
    // way a real list is, so callers cannot distinguish the cases and the
    // fail-closed default ("allow nothing") holds.
    let allowedUrls: string[] = [];
    if (SAFE_PROJECT_ID.test(projectId)) {
      try {
        const supabase = await deps.supabaseClient();
        const project = await deps.getProjectById(projectId, supabase);
        if (Array.isArray(project?.allowed_urls)) {
          allowedUrls = project.allowed_urls.filter(
            (u: unknown): u is string => typeof u === "string",
          );
        }
      } catch {
        allowedUrls = [];
      }
    }

    const data = await deps.encryptAllowlist(allowedUrls);

    // Cacheable for everyone — the payload is encrypted, so a shared CDN
    // cache entry leaks nothing. 5-minute TTL bounds how long an allowlist
    // edit takes to propagate. The per-project surrogate key allows a
    // targeted purge when a publisher updates their allowlist; the malformed
    // -id path falls back to the coarse key only.
    const surrogateKey = SAFE_PROJECT_ID.test(projectId)
      ? `allowed-urls allowed-urls-${projectId}`
      : "allowed-urls";
    return successRespWithCache({ data }, 300, 300, surrogateKey);
  } catch (error) {
    captureException(error, { handler: "allowed-urls" });
    return errorResp("Internal server error", 500);
  }
}

// @ts-ignore: Deno globals and JSR imports are unavailable to the editor TS server
Deno.serve(serveWithSentry("allowed-urls", (req: Request) => allowedUrlsHandler(req)));
