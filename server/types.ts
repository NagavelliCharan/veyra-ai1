export interface ConversationContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequestBody {
  message: string;
  conversationHistory?: ConversationContextMessage[];
  consentGiven: boolean;
  provider?: 'gemini' | 'groq';
}

export interface ChatResponseBody {
  reply: string;
  model: string;
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
}

export interface HealthResponseBody {
  status: 'ok' | 'degraded';
  provider: 'gemini' | 'groq' | 'none';
  geminiConfigured: boolean;
  groqConfigured: boolean;
  model: string;
  storageBackend?: 'mongodb' | 'disk';
}
