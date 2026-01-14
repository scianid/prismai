import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { projectId, articleId, title, content } = await req.json();
    
    // For now, return preset suggestions
    // In the future, this could use AI to generate contextual questions based on article content
    const suggestions = [
      'Summarize this article in 3 key points',
      'What are the main arguments presented?',
      'What are the practical implications?'
    ];

    // TODO: Integrate with AI model to generate contextual questions
    // const aiSuggestions = await generateQuestionsFromContent(title, content);

    return new Response(
      JSON.stringify({ suggestions }),
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
