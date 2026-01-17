const TOTAL_SUGGESTIONS = 5;
const AI_MODEL = 'deepseek-chat';
const AI_URL = 'https://api.deepseek.com/v1/chat/completions';

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

function getApiKey(): string {
  // @ts-ignore
  const apiKey = Deno.env.get('DEEPSEEK_API');
  if (!apiKey)
    throw new Error('DEEPSEEK_API key not set');
  return apiKey;
}

export async function generateSuggestions(title: string, content: string, language: string): Promise<SuggestionItem[]> {
  const apiKey = getApiKey();

  const prompt = `You are generating ${TOTAL_SUGGESTIONS} short, helpful questions a reader might want to ask about the article below.
  Write the questions in this language: ${language}.
  Title: 
  ${title}
  
  Content:
  ${content}
  
  Return ONLY a JSON array of ${TOTAL_SUGGESTIONS} strings in ${language} language.
   Do not include any additional text.
   First question should always be "Summarized the article in brief." make sure all questions are in the specified language: ${language}.`;

  const response = await fetch(AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
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
    throw new Error(`ai: deepseek response not ok: ${response.status}`);
  }

  const data = await response.json() as DeepSeekChatResponse;
  const contentText = data?.choices?.[0]?.message?.content;
  if (!contentText)
    console.error('ai: missing content in deepseek response', { data });

  try {
    const parsed = JSON.parse(stripCodeFences(contentText || ''));
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
      return toSuggestionItems(parsed.slice(0, TOTAL_SUGGESTIONS));
    }
    if (parsed && Array.isArray(parsed.suggestions) && parsed.suggestions.every((s: unknown) => typeof s === 'string')) {
      return toSuggestionItems(parsed.suggestions.slice(0, TOTAL_SUGGESTIONS));
    }
    console.error('ai: parsed content is not string array', { parsed });
  } catch (error) {
    console.error('ai: failed to parse deepseek content', { contentText, error });
    throw new Error(`ai: failed to parse deepseek response: ${error}`);
  }

  throw new Error('ai: generateSuggestions did not produce suggestions');
}


export async function streamAnswer(title: string, content: string, question: string): Promise<Response> {
  const apiKey = getApiKey();

  const systemPrompt = `You are a helpful assistant that answers questions about an article. 
    Reply concisely but make sure you respond fully.
    Do not answer questions unrelated to the article. 
    under any circumstance, do not mention you are an AI model. 
    If the question is not related to the article, reply with 
    "I'm sorry, I can only answer questions related to the article."`;

  const userPrompt = `Title: 
    ${title || ''}

    Content:
    ${content || ''}
    
    Question: 
    ${question}`;

  const aiResponse = await fetch(AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      stream: true
    })
  });

  if (!aiResponse.ok || !aiResponse.body) {
    console.error('chat: AI request failed', { status: aiResponse.status });
    throw new Error('AI request failed');
  }

  return aiResponse;
}

type DeepSeekStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

export async function readDeepSeekStreamAndCollectAnswer(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.replace(/^data:\s*/, '');
        if (data === '[DONE]') {
          return answer;
        }
        try {
          const json = JSON.parse(data) as DeepSeekStreamChunk;
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) answer += delta;
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  return answer;
}
