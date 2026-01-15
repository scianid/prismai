type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type SuggestionItem = {
  id: string;
  question: string;
  answer: string | null;
};

const fallbackQuestions: string[] = [];

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```[a-zA-Z]*\n?/, '')
      .replace(/```\s*$/, '')
      .trim();
  }
  return trimmed;
}

function toSuggestionItems(questions: string[]): SuggestionItem[] {
  return questions.map((question) => ({
    id: crypto.randomUUID(),
    question,
    answer: null
  }));
}

export async function generateSuggestions(title: string, content: string, language: string): Promise<SuggestionItem[]> {
  const apiKey = Deno.env.get('DEEPSEEK_API');
  if (!apiKey) {
    return toSuggestionItems(fallbackQuestions);
  }

  const prompt = `You are generating 3 short, helpful questions a reader might ask about the article below.
  Write the questions in this language: ${language}.
  Title: 
  ${title}
  
  Content:
  ${content}
  
  Return ONLY a JSON array of 3 strings in ${language} language.
   Do not include any additional text.
   First question should always be "Summarized the article in brief." make sure all questions are in the specified language: ${language}.`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that returns concise JSON only. Example response: {"suggestions":["Question 1","Question 2","Question 3"]}' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4
    })
  });

  if (!response.ok) {
    console.error('ai: deepseek response not ok', { status: response.status });
    return toSuggestionItems(fallbackQuestions);
  }

  const data = await response.json() as DeepSeekChatResponse;
  const contentText = data?.choices?.[0]?.message?.content;
  if (!contentText) {
    console.error('ai: missing content in deepseek response', { data });
  }
  try {
    const parsed = JSON.parse(stripCodeFences(contentText || ''));
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
      return toSuggestionItems(parsed.slice(0, 3));
    }
    if (parsed && Array.isArray(parsed.suggestions) && parsed.suggestions.every((s: unknown) => typeof s === 'string')) {
      return toSuggestionItems(parsed.suggestions.slice(0, 3));
    }
    console.error('ai: parsed content is not string array', { parsed });
  } catch (error) {
    console.error('ai: failed to parse deepseek content', { contentText, error });
    // ignore parse errors and fall back
  }

  return toSuggestionItems(fallbackQuestions);
}
