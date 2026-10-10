import type { ConversationContextMessage } from '../../../server/types.ts';

export interface GroqClientResponse {
  reply: string;
  model: string;
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
}

export class GroqClient {
  private baseUrl = '';

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async checkHealth(): Promise<{
    isOnline: boolean;
    provider: 'gemini' | 'groq' | 'none';
    groqConfigured: boolean;
    geminiConfigured: boolean;
    model: string;
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        return {
          isOnline: false,
          provider: 'none',
          groqConfigured: false,
          geminiConfigured: false,
          model: 'unknown',
        };
      }

      const data = await res.json();
      return {
        isOnline: true,
        provider: data.provider || 'gemini',
        groqConfigured: Boolean(data.groqConfigured),
        geminiConfigured: Boolean(data.geminiConfigured),
        model: data.model || 'gemini-3.8-flash',
      };
    } catch {
      return {
        isOnline: false,
        provider: 'none',
        groqConfigured: false,
        geminiConfigured: false,
        model: 'unknown',
      };
    }
  }

  /**
   * Sends user message and minimal conversation history to Veyra AI backend.
   *
   * Privacy Guarantees:
   * 1. Never sends the API key from the browser.
   * 2. Excludes project notes, files, and unrelated conversations.
   * 3. Requires explicit consent flag.
   */
  async sendMessage(
    message: string,
    history: ConversationContextMessage[],
    consentGiven: boolean,
    provider?: 'gemini' | 'groq'
  ): Promise<GroqClientResponse> {
    if (!consentGiven) {
      throw new Error(
        'Consent required: You must explicitly approve sending prompts to Cloud AI before continuing.'
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          message,
          conversationHistory: history,
          consentGiven,
          provider,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(
            data?.error ||
              'GEMINI_API_KEY is not configured on the server. Please copy .env.example to .env and configure your key.'
          );
        }

        if (response.status === 403) {
          throw new Error(
            data?.error || 'Consent was not accepted for external AI communication.'
          );
        }

        throw new Error(data?.error || `Server responded with status ${response.status}`);
      }

      return {
        reply: data.reply,
        model: data.model || 'gemini-3.8-flash',
        usage: data.usage,
      };
    } catch (err: any) {
      if (err.message && err.message.includes('Failed to fetch')) {
        throw new Error(
          'Could not reach the Veyra AI backend server. Please verify that the server is running on port 3001 (`npm run server`).'
        );
      }
      throw err;
    }
  }
}

export const groqClient = new GroqClient();
export const geminiClient = groqClient; // Backwards compatible alias
