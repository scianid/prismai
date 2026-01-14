import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
    const { projectId, client_id, title, article_content } = await req.json();
    
    // Use projectId or client_id
    const widgetId = projectId || client_id;
    
    if (!widgetId) {
      return new Response(
        JSON.stringify({ error: 'Missing projectId or client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Fetch project config from database
    const { data, error } = await supabase
      .from('project')
      .select('*')
      .eq('widget_id', widgetId)
      .single();

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
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw error;
    }

    // Map database fields to widget config format
    const config = {
      direction: 'ltr', // Could be added to DB schema
      language: 'en', // Could be added to DB schema
      icon_url: 'https://images.icon-icons.com/167/PNG/512/cnn_23166.png', // Could be added to DB
      client_name: data.button_text || 'Demo Site',
      client_description: data.greeting_message || 'Article Assistant',
      highlight_color: [data.primary_color || '#68E5FD', '#A389E0'],
      show_ad: true, // Could be added to DB schema
      input_text_placeholders: [
        'Ask anything about this article...',
        'What would you like to know?',
        'I can explain, summarize, or answer questions...'
      ],
      position: data.position,
      api_endpoint: data.api_endpoint
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
