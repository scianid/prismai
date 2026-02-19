const TOTAL_SUGGESTIONS = 5;
const MAX_TOKENS_CHAT = 4000;
const MAX_TOKENS_SUGGESTIONS = 4000;
const AI_PROVIDER_ENV = 'AI_PROVIDER';
const DEFAULT_PROVIDER = 'openai';

const AI_PROVIDERS = {
  deepseek: {
    label: 'deepseek',
    apiKeyEnv: 'DEEPSEEK_API',
    model: 'deepseek-chat',
    url: 'https://api.deepseek.com/v1/chat/completions'
  },
  openai: {
    label: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'gpt-5.2',
    url: 'https://api.openai.com/v1/chat/completions'
  }
} as const;

type AiProvider = keyof typeof AI_PROVIDERS;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type SuggestionItem = {
  id: string;
  question: string;
  answer: string | null;
};

export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SuggestionsResult = {
  suggestions: SuggestionItem[];
  tokenUsage: TokenUsage | null;
};

export type StreamResult = {
  response: Response;
  tokenUsage: TokenUsage | null;
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

function getProvider(): AiProvider {
  // @ts-ignore
  const provider = Deno.env.get(AI_PROVIDER_ENV)?.toLowerCase();
  if (!provider) return DEFAULT_PROVIDER as AiProvider;
  if (provider in AI_PROVIDERS) return provider as AiProvider;
  throw new Error(`AI_PROVIDER must be one of: ${Object.keys(AI_PROVIDERS).join(', ')}`);
}

function getAiConfig() {
  const provider = getProvider();
  const config = AI_PROVIDERS[provider];
  // @ts-ignore
  const apiKey = Deno.env.get(config.apiKeyEnv);
  if (!apiKey)
    throw new Error(`${config.apiKeyEnv} key not set`);
  return {
    ...config,
    provider,
    apiKey
  };
}

export async function generateSuggestions(title: string, content: string, language: string): Promise<SuggestionsResult> {
  const { apiKey, url, model, provider } = getAiConfig();
  console.info('ai: generateSuggestions', { provider, model });

  const tokenParam = provider === 'openai'
    ? { max_completion_tokens: MAX_TOKENS_SUGGESTIONS }
    : { max_tokens: MAX_TOKENS_SUGGESTIONS };

  const prompt = `You are generating ${TOTAL_SUGGESTIONS} short, helpful questions a reader might want to ask about the article below.
  Write the questions in this language: ${language}.
  Title: 
  ${title}
  
  Content:
  ${content}
  
  Return ONLY a JSON array of ${TOTAL_SUGGESTIONS} strings in ${language} language.
   Do not include any additional text.
   First question should always be "Summarized the article in brief." make sure all questions are in the specified language: ${language}.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that returns concise JSON only. Example response: {"suggestions":["Question 1","Question 2","Question 3"]}' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      ...tokenParam
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`ai: ${provider} response not ok`, { status: response.status, model, errorBody });
    throw new Error(`ai: ${provider} response not ok: ${response.status}`);
  }

  const data = await response.json() as ChatCompletionResponse;
  const contentText = data?.choices?.[0]?.message?.content;
  if (!contentText)
  console.error(`ai: missing content in ${provider} response`, { data });

  // Extract token usage
  const tokenUsage: TokenUsage | null = data.usage ? {
    inputTokens: data.usage.prompt_tokens || 0,
    outputTokens: data.usage.completion_tokens || 0,
    totalTokens: data.usage.total_tokens || 0
  } : null;

  console.log('ai: token usage', tokenUsage);

  try {
    const parsed = JSON.parse(stripCodeFences(contentText || ''));
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
      return { suggestions: toSuggestionItems(parsed.slice(0, TOTAL_SUGGESTIONS)), tokenUsage };
    }
    if (parsed && Array.isArray(parsed.suggestions) && parsed.suggestions.every((s: unknown) => typeof s === 'string')) {
      return { suggestions: toSuggestionItems(parsed.suggestions.slice(0, TOTAL_SUGGESTIONS)), tokenUsage };
    }
    console.error('ai: parsed content is not string array', { parsed });
  } catch (error) {
    console.error(`ai: failed to parse ${provider} content`, { contentText, error });
    throw new Error(`ai: failed to parse ${provider} response: ${error}`);
  }

  throw new Error('ai: generateSuggestions did not produce suggestions');
}


// Overload for backward compatibility (single question)
export async function streamAnswer(title: string, content: string, question: string): Promise<Response>;
// Overload for conversation history (message array)
export async function streamAnswer(messages: Message[]): Promise<Response>;

export async function streamAnswer(
  titleOrMessages: string | Message[],
  content?: string,
  question?: string
): Promise<Response> {
  const { apiKey, url, model, provider } = getAiConfig();
  console.info('ai: streamAnswer', { provider, model });

  const tokenParam = provider === 'openai'
    ? { max_completion_tokens: MAX_TOKENS_CHAT }
    : { max_tokens: MAX_TOKENS_CHAT };
  
  let messages: Message[];
  
  // Handle message array (new conversation format)
  if (Array.isArray(titleOrMessages)) {
    messages = titleOrMessages;
  } else {
    // Handle legacy format (title, content, question)
    // @ts-ignore
    const rejectUnrelatedQuestions = Deno.env.get('REJECT_UNRELATED_QUESTIONS') === 'true';
    
    const denyUnrelatedQuestionsPrompt = `
      Do not answer questions unrelated to the article.
      If the question is not related to the article, reply with:
      "I'm sorry, I can only answer questions related to the article." but in the same language as the question.  
  `

    const systemPrompt = `You are a helpful assistant that answers questions about an article or subjects related to the article. 
      Reply concisely in under 500 characters but make sure you respond fully and correctly. Be as brief as possible.
      under any circumstance, do not mention you are an AI model.
      if you cant base your answer on the article content, use your own knowledge - but you must mention shortly that it did not appear in the article.
      ${rejectUnrelatedQuestions ? denyUnrelatedQuestionsPrompt : ''}
      `;

    const userPrompt = `Title: 
      ${titleOrMessages || ''}

      Content:
      ${content || ''}
      
      Question: 
      ${question}`;
    
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  const aiResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: messages,
      temperature: 0.4,
      ...tokenParam,
      stream: true
    })
  });

  if (!aiResponse.ok || !aiResponse.body) {
    const errorBody = await aiResponse.text().catch(() => '');
    console.error(`chat: ${provider} request failed`, { status: aiResponse.status, model, errorBody });
    throw new Error(`${provider} request failed`);
  }

  return aiResponse;
}

type DeepSeekStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type StreamCollectResult = {
  answer: string;
  tokenUsage: TokenUsage | null;
};

export async function readDeepSeekStreamAndCollectAnswer(stream: ReadableStream<Uint8Array>): Promise<StreamCollectResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let tokenUsage: TokenUsage | null = null;

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
          return { answer, tokenUsage };
        }
        try {
          const json = JSON.parse(data) as DeepSeekStreamChunk;
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) answer += delta;
          
          // Capture token usage from the chunk (typically in final chunk)
          if (json?.usage) {
            tokenUsage = {
              inputTokens: json.usage.prompt_tokens || 0,
              outputTokens: json.usage.completion_tokens || 0,
              totalTokens: json.usage.total_tokens || 0
            };
            console.log('ai: ✓ stream token usage captured', tokenUsage);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  return { answer, tokenUsage };
}

/**
 * Estimate character count for message pruning
 * Simply returns string length for fast calculation
 */
export function estimateCharCount(text: string): number {
  return text.length;
}
