import { GoogleGenAI } from '@google/genai';
import type { ConversationContextMessage, ChatResponseBody } from './types.ts';

export class MissingApiKeyError extends Error {
  constructor(
    message = 'GEMINI_API_KEY environment variable is not configured on the server. Please set it in your .env file.'
  ) {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

export const PRIVY_SYSTEM_INSTRUCTION = `You are Veyra AI, an exceptionally capable, intelligent, versatile, and thoughtful AI assistant embedded in a privacy-first workspace.

Your mission is to provide accurate, high-quality, comprehensive, and helpful answers to ALL questions the user asks across every domain.

Core Capabilities & Guidelines:
1. Universal Domain Expertise:
   - Science, Technology, Engineering & Mathematics (STEM): Solve complex mathematics, physics, logic puzzles, statistics, and science queries with methodical step-by-step reasoning and accurate calculations.
   - Software Engineering & Programming: Write robust, bug-free, idiomatic code in any programming language (Python, TypeScript, JavaScript, C++, Go, Rust, Java, SQL, Bash, HTML/CSS, etc.). Always provide complete, runnable code examples with clear explanations of edge cases.
   - General Knowledge & Analysis: Answer questions about history, geography, science, literature, philosophy, finance, business, legal concepts, health, and current concepts accurately and objectively.
   - Creative & Writing Assistance: Draft polished essays, emails, technical reports, creative narratives, translations, and summaries tailored to user needs.
   - Document & Project Synthesis: When attached document excerpts or project notes are provided, meticulously analyze and reference them, extracting key insights and answering specific questions accurately.

2. Accuracy & Step-by-Step Rigor:
   - Never give vague, dismissive, or hand-waving answers.
   - For mathematical, algorithmic, or logical reasoning problems, think carefully step-by-step and double-check your arithmetic and logic before stating conclusions.
   - If a prompt has multiple parts, answer every part completely and systematically.

3. Clear, Structured Presentation:
   - Use clean, well-structured GitHub-flavored Markdown.
   - Use headings (##, ###), bullet points, and numbered steps for readability.
   - Use fenced code blocks with language identifiers for all code.
   - Use LaTeX math formatting ($...$ inline or $$...$$ display) for mathematical formulas.

4. Personality & Approach:
   - Helpful, intelligent, articulate, respectful, and direct.
   - Avoid generic or repetitive conversational filler. Deliver deep value immediately.`;

export class GeminiService {
  private defaultModel = 'gemini-3.8-flash';
  private maxHistoryMessages = 8;
  private maxMessageLength = 12000;

  getModelName(): string {
    return process.env.GEMINI_MODEL || this.defaultModel;
  }

  isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0 && key !== 'your_gemini_api_key_here');
  }

  /**
   * Generates a reply using the official Google Gemini API (@google/genai).
   * Supports both standard Google API keys (AIza...) and new Auth keys (AQ...).
   *
   * Privacy & Security Guarantees:
   * 1. Data Minimization: Transmits ONLY the active prompt and limited recent history.
   * 2. Zero Logging: Never writes prompt text, completion text, or API keys to server logs.
   * 3. Zero Persistence: Stateless execution; no database or disk cache is ever used.
   */
  async generateReply(
    userMessage: string,
    history?: ConversationContextMessage[]
  ): Promise<ChatResponseBody> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim() || apiKey === 'your_gemini_api_key_here') {
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

    let modelName = this.getModelName();

    // Map legacy/deprecated model names to gemini-3.8-flash to prevent 404 NOT_FOUND errors
    const deprecatedModels = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-pro',
    ];
    if (deprecatedModels.includes(modelName)) {
      modelName = 'gemini-3.8-flash';
    }

    // Prepare raw conversation items
    const rawItems: Array<{ role: 'user' | 'model'; text: string }> = [];

    if (Array.isArray(history) && history.length > 0) {
      const slice = history.slice(-this.maxHistoryMessages);
      for (const item of slice) {
        if (!item.content || typeof item.content !== 'string') continue;
        const text = item.content.trim().slice(0, this.maxMessageLength);
        if (!text) continue;

        rawItems.push({
          role: item.role === 'assistant' ? 'model' : 'user',
          text,
        });
      }
    }

    // Append active user query
    rawItems.push({
      role: 'user',
      text: trimmedMessage,
    });

    // Normalize turns for Google Gemini:
    // 1. Must begin with a 'user' turn.
    // 2. Turns must strictly alternate (user -> model -> user -> model).
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    let startIndex = 0;
    while (startIndex < rawItems.length && rawItems[startIndex].role === 'model') {
      startIndex++;
    }

    for (let i = startIndex; i < rawItems.length; i++) {
      const current = rawItems[i];
      if (contents.length > 0 && contents[contents.length - 1].role === current.role) {
        // Consecutive turns with identical role: merge into one turn
        contents[contents.length - 1].parts.push({ text: current.text });
      } else {
        contents.push({
          role: current.role,
          parts: [{ text: current.text }],
        });
      }
    }

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

      const requestConfig = {
        systemInstruction: PRIVY_SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 8192,
      };

      // Multi-model fallback cascade to guarantee uninterrupted chats across quota limits
      const candidateList = Array.from(
        new Set([
          modelName,
          'gemini-3.5-flash',
          'gemini-3.5-flash-lite',
          'gemini-3.1-flash-lite',
          'gemini-flash-lite-latest',
          'gemini-3.8-flash',
        ])
      );

      let response: any;
      let lastErr: any;
      let usedModel = modelName;

      for (const candidate of candidateList) {
        try {
          response = await ai.models.generateContent({
            model: candidate,
            config: requestConfig,
            contents,
          });
          usedModel = candidate;
          lastErr = null;
          break;
        } catch (callErr: any) {
          lastErr = callErr;
          const msg = callErr?.message || '';
          // If quota exhausted (429) or model not found (404), seamlessly try next candidate
          if (
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('Quota exceeded') ||
            msg.includes('404') ||
            msg.includes('NOT_FOUND') ||
            msg.includes('not found') ||
            msg.includes('no longer available')
          ) {
            continue;
          }
          throw callErr;
        }
      }

      if (!response && lastErr) {
        throw lastErr;
      }

      let replyText = response?.text || '';
      // Fallback extraction if response.text accessor is empty
      if (!replyText && response?.candidates?.[0]?.content?.parts) {
        replyText = response.candidates[0].content.parts
          .map((p: any) => p.text || '')
          .filter(Boolean)
          .join('\n');
      }

      const usage = response?.usageMetadata;

      return {
        reply: replyText,
        model: response?.modelVersion || usedModel || modelName,
        usage: {
          promptTokens: usage?.promptTokenCount,
          candidatesTokens: usage?.candidatesTokenCount,
          totalTokens: usage?.totalTokenCount,
        },
      };
    } catch (err: any) {
      if (err instanceof MissingApiKeyError) throw err;

      const rawMsg = err?.message || 'An error occurred while contacting Google Gemini API.';

      if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('401') || rawMsg.includes('UNAUTHENTICATED')) {
        throw new Error(
          'Configured GEMINI_API_KEY is invalid or unauthorized. Please verify your API key in Google AI Studio.'
        );
      }

      if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429') || rawMsg.includes('Quota exceeded')) {
        throw new Error(
          'Gemini API rate limit or quota exceeded. Please wait a moment or try again later.'
        );
      }

      if (rawMsg.includes('404') || rawMsg.includes('NOT_FOUND')) {
        throw new Error(
          `Selected Gemini model (${modelName}) is not available. Please use gemini-3.8-flash in .env.`
        );
      }

      // Safe sanitized error without leaking API key
      throw new Error(`Google Gemini API error: ${rawMsg}`);
    }
  }
}

export const geminiService = new GeminiService();
