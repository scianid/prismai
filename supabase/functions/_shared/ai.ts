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
        { role: 'system', content: 'You are a helpful assistant that returns concise JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4
    })
  });

  if (!response.ok) {
    return toSuggestionItems(fallbackQuestions);
  }

  const data = await response.json() as DeepSeekChatResponse;
  const contentText = data?.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(contentText || '');
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
      return toSuggestionItems(parsed.slice(0, 3));
    }
  } catch {
    // ignore parse errors and fall back
  }

  return toSuggestionItems(fallbackQuestions);
}
