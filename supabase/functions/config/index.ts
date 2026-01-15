import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId, client_id } = await req.json();

    // Use projectId or client_id
    const projectKey = projectId || client_id;

    if (!projectKey) {
      return new Response(
        JSON.stringify({ error: 'Missing projectId or client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch project config from database
    const { data, error } = await supabase
      .from('project')
      .select('*')
      .eq('project_id', projectKey)
      .single();


    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOrigin(requestUrl, data.allowed_urls)) {
      return new Response(
        JSON.stringify({ error: 'Origin not allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (error) {
      console.error('Database error:', error);
      
      // Return default config if not found
      if (error.code === 'PGRST116') {
        return new Response(
          JSON.stringify({
            direction: 'ltr',
            language: 'en',
            icon_url: 'https://images.icon-icons.com/167/PNG/512/cnn_23166.png',
            client_name: 'Demo Site',
            client_description: 'Article Assistant',
            highlight_color: ['#68E5FD', '#A389E0'],
            show_ad: true,
            input_text_placeholders: [
              'Ask anything about this article...'
            ]
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw error;
    }
    
    // Map database fields to widget config format
    const config = {
      direction: data.direction || 'ltr',
      language: data.language || 'en',
      icon_url: data.icon_url || 'https://images.icon-icons.com/167/PNG/512/cnn_23166.png',
      client_name: data.client_name || 'Demo Site',
      client_description: data.client_description || 'Article Assistant',
      highlight_color: data.highlight_color || ['#68E5FD', '#A389E0'],
      show_ad: typeof data.show_ad === 'boolean' ? data.show_ad : true,
      input_text_placeholders: data.input_text_placeholders || [
        'Ask anything about this article...'
      ]
    };

    return new Response(
      JSON.stringify(config),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        } 
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
