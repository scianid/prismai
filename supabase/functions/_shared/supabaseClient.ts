// @ts-ignore
import { createClient } from 'jsr:@supabase/supabase-js@2';

// @ts-ignore: Deno is available in the runtime environment
export async function supabaseClient() {
  return createClient(
    // @ts-ignore
    Deno.env.get('SUPABASE_URL') ?? '',
    // @ts-ignore
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}