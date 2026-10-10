import type { ConversationContextMessage, ChatResponseBody } from './types.ts';
import { PRIVY_SYSTEM_INSTRUCTION } from './geminiService.ts';

export class MissingApiKeyError extends Error {
  constructor(
    message = 'GROQ_API_KEY environment variable is not configured on the server. Please set it in your .env file.'
  ) {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

export class GroqService {
  private defaultModel = 'openai/gpt-oss-120b';
  private maxHistoryMessages = 6;
  private maxMessageLength = 10000;
  private groqEndpoint = 'https://api.groq.com/openai/v1/chat/completions';

  getModelName(): string {
    return process.env.GROQ_MODEL || this.defaultModel;
  }

  isConfigured(): boolean {
    const key = process.env.GROQ_API_KEY;
    return Boolean(key && key.trim().length > 0 && key !== 'your_groq_api_key_here');
  }

  /**
   * Generates a reply using the high-performance Groq Cloud API.
   *
   * Privacy & Security Guarantees:
   * 1. Data Minimization: Transmits ONLY the active prompt and limited recent history (max 6 items).
   * 2. Zero Logging: Never writes prompt text, completion text, or API keys to server logs.
   * 3. Zero Persistence: Stateless execution; no database or disk cache is ever used.
   */
  async generateReply(
    userMessage: string,
    history?: ConversationContextMessage[]
  ): Promise<ChatResponseBody> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !apiKey.trim() || apiKey === 'your_groq_api_key_here') {
      throw new MissingApiKeyError();
    }

    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      throw new Error('User message is required and cannot be empty.');
    }

    const trimmedMessage = userMessage.trim();
    if (trimmedMessage.length > this.maxMessageLength) {
      throw new Error(
        `Message exceeds maximum allowed character length of ${this.maxMessageLength} characters.`
      );
    }

    const modelName = this.getModelName();

    // Format minimal conversation context
    // Exclude unrelated notes, files, or older conversations
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: PRIVY_SYSTEM_INSTRUCTION,
      },
    ];

    if (Array.isArray(history) && history.length > 0) {
      // Take only the most recent N messages to minimize external payload size
      const slice = history.slice(-this.maxHistoryMessages);
      for (const item of slice) {
        if (!item.content || typeof item.content !== 'string') continue;
        const text = item.content.trim().slice(0, this.maxMessageLength);
        if (!text) continue;

        messages.push({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: text,
        });
      }
    }

    // Append the current message
    messages.push({
      role: 'user',
      content: trimmedMessage,
    });

    try {
      const response = await fetch(this.groqEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data?.error?.message || response.statusText || 'Unknown error';

        if (response.status === 401 || errorMsg.includes('Invalid API Key') || errorMsg.includes('Unauthorized')) {
          throw new Error('Configured GROQ_API_KEY is invalid. Please check your credentials in Groq Console.');
        }

        if (response.status === 429 || errorMsg.includes('rate_limit_exceeded')) {
          throw new Error('Groq API rate limit or quota exceeded. Please wait a moment or try again later.');
        }

        throw new Error(`Groq API error: ${errorMsg}`);
      }

      const replyText = data?.choices?.[0]?.message?.content || '';
      const usage = data?.usage;

      return {
        reply: replyText,
        model: modelName,
        usage: {
          promptTokens: usage?.prompt_tokens,
          candidatesTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
      };
    } catch (err: any) {
      if (err instanceof MissingApiKeyError) throw err;

      // Safe error handling without leaking API keys
      const errorMsg = err?.message || 'An error occurred while contacting Groq Cloud API.';

      if (errorMsg.includes('GROQ_API_KEY') || errorMsg.includes('Groq API')) {
        throw err;
      }

      throw new Error(`Groq Cloud API error: ${errorMsg}`);
    }
  }
}

export const groqService = new GroqService();
