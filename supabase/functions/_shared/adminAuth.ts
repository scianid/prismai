import { corsHeaders } from './cors.ts';

/**
 * Verify that the caller's Supabase JWT belongs to a user who has access to
 * the given project (via account_collaborator or direct account ownership).
 *
 * Throws a Response with status 401/403 on failure so callers can return it directly.
 */
export async function verifyAdminAccess(
  supabase: any,
  authHeader: string | null,
  projectId: string
): Promise<void> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw unauthorizedResponse('Missing or malformed Authorization header');
  }

  const jwt = authHeader.replace('Bearer ', '').trim();

  // Validate JWT and get the caller's user record
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    throw unauthorizedResponse('Invalid or expired token');
  }

  // Load the project to get its account_id
  const { data: project, error: projectError } = await supabase
    .from('project')
    .select('account_id')
    .eq('project_id', projectId)
    .maybeSingle();

  if (projectError || !project) {
    throw forbiddenResponse('Project not found');
  }

  // Check the user is the account owner OR a collaborator
  const { data: collab, error: collabError } = await supabase
    .from('account_collaborator')
    .select('id')
    .eq('account_id', project.account_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (collabError) {
    console.error('adminAuth: collaborator lookup error', collabError);
    throw forbiddenResponse('Access denied');
  }

  // Also allow if the user IS the account owner (account.owner_id = user.id)
  if (!collab) {
    const { data: account } = await supabase
      .from('account')
      .select('owner_id')
      .eq('id', project.account_id)
      .maybeSingle();

    if (!account || account.owner_id !== user.id) {
      throw forbiddenResponse('Access denied');
    }
  }
}

function unauthorizedResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function forbiddenResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
