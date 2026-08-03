import { OpenRouter } from '@openrouter/sdk';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey || apiKey === 'sk-or-v1-xxx') {
  console.warn('[OpenRouter] WARNING: No valid API key configured. AI features will be disabled.');
}

const client = new OpenRouter({
  apiKey: apiKey || 'sk-or-v1-xxx',
});

// Model tiers
export const MODELS = {
  fast: 'deepseek/deepseek-v4-flash',
  quality: 'deepseek/deepseek-v4-flash',
  free: 'deepseek/deepseek-v4-flash:free',
};

interface JsonSchemaConfig {
  name: string;
  schema: Record<string, any>;
}

export async function aiChat(params: {
  model?: string;
  system?: string;
  prompt: string;
  jsonSchema?: JsonSchemaConfig;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | Record<string, any>> {
  if (!apiKey || apiKey === 'sk-or-v1-xxx') {
    console.warn('[OpenRouter] No API key, returning empty response');
    return params.jsonSchema ? {} : '';
  }

  try {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (params.system) {
      messages.push({ role: 'system', content: params.system });
    }
    messages.push({ role: 'user', content: params.prompt });

    const request: any = {
      model: params.model || MODELS.fast,
      messages,
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 4096,  // Higher for reasoning models
      stream: false,
      provider: {
        zdr: true,       // zero data retention
        sort: 'price',   // cheapest provider first
      },
    };

    if (params.jsonSchema) {
      request.response_format = {
        type: 'json_schema',
        json_schema: {
          name: params.jsonSchema.name,
          schema: params.jsonSchema.schema,
        },
      };
    }

    const result = await client.chat.send(request);

    // Type narrowing: non-streaming responses have 'choices'
    const response = 'choices' in result ? (result as any) : null;
    if (!response?.choices?.[0]) {
      console.error('[OpenRouter] Unexpected response format:', JSON.stringify(result).slice(0, 200));
      return params.jsonSchema ? {} : '';
    }
    const content = response.choices[0].message?.content || '';

    if (params.jsonSchema) {
      try {
        return JSON.parse(content);
      } catch {
        return {};
      }
    }

    return content;
  } catch (err) {
    console.error('[OpenRouter] API error:', err);
    return params.jsonSchema ? {} : '';
  }
}
