// Mock AI Service with simulated streaming and privacy-first responses

export interface AIServiceResponse {
  content: string;
  tokenCount: number;
  modelName: string;
}

export class MockAIService {
  private static MOCK_RESPONSES: Record<string, string> = {
    privacy: `### Privacy Analysis: Local-First vs. Cloud AI Architectures

When evaluating confidentiality in conversational research tools, three primary pillars emerge:

1. **Zero-Knowledge Data Retention**:
   - In traditional cloud LLMs, prompts and completion pairs are often stored in central databases for logging, telemetry, or model fine-tuning.
   - **Veyra AI's approach**: Conversation threads, notes, and local research documents never traverse an unencrypted external server.

2. **Client-Side Cryptography (Web Crypto API)**:
   - Utilizes **AES-GCM (256-bit)** with random 96-bit initialization vectors per record.
   - Keys are derived via **PBKDF2** (100,000 rounds of SHA-256) directly from your master passphrase.

\`\`\`typescript
// Client-side envelope encryption pattern
const envelope = await encryptData(messagePayload, derivedMasterKey);
await idbService.put('messages', envelope);
\`\`\`

3. **Data Minimization Guarantee**:
   - Zero background analytics or telemetry trackers.
   - Ephemeral session memory is completely wiped upon browser window unload.`,

    research: `### Research Synthesis & Methodology Outline

Here is a structured methodology framework tailored for privacy-conscious research:

#### Phase 1: Problem Definition & Threat Modeling
- Identify confidential entities and potential side-channel leaks.
- Determine whether data sensitivity warrants **Session-Only mode** or **Encrypted Local Storage**.

#### Phase 2: Information Gathering & File Synthesis
- Attach and index local documents in your **Project Files** vault.
- Keep ongoing observations and qualitative synthesis in the **Project Notes** editor.

#### Phase 3: Analytical Verification
- Cross-reference conversation summaries with primary source documents.
- Export your project workspace as an encrypted backup for long-term auditability.

> *Note: All synthesized findings remain strictly on your local machine.*`,

    code: `### Privacy-Preserving Cryptographic Implementation

Here is an example of generating an authenticated AES-GCM cipher envelope using the browser's native **Web Crypto API**:

\`\`\`typescript
export async function secureEncrypt(plaintext: string, key: CryptoKey) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv),
    timestamp: Date.now()
  };
}
\`\`\`

#### Key Highlights:
- **No external dependencies**: Uses standard browser primitives.
- **Authenticated integrity**: AES-GCM guarantees both confidentiality and ciphertext integrity.`,

    default: `I am **Veyra AI**, your local-first research and private analysis assistant.

Here is what you can do in this workspace:
- 📁 **Organize by Project**: Group related chats, notes, and documents into dedicated folders.
- 📝 **Markdown Notes**: Draft and preview research notes directly alongside your conversations.
- 🔒 **End-to-End Privacy**: Switch to **Session-Only mode** to keep everything in volatile RAM, or **Encrypted Local mode** to protect your data with AES-256-GCM.
- 🔍 **Instant Local Search**: Hit \`Ctrl+K\` (or \`Cmd+K\`) to search across all your projects and chats without leaving your device.

How can I assist your research or analysis today?`
  };

  /**
   * Simulates an intelligent streaming AI response
   */
  async streamResponse(
    prompt: string,
    onToken: (token: string, fullText: string) => void,
    onComplete: (response: AIServiceResponse) => void
  ): Promise<void> {
    const lowerPrompt = prompt.toLowerCase();
    let replyTemplate = MockAIService.MOCK_RESPONSES.default;
    // Evaluate arithmetic expressions directly (e.g. "what is 14 * 14", "15 + 15")
    const mathMatch = prompt.match(/(?:what is|calculate|compute|solve)?\s*(-?\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(-?\d+(?:\.\d+)?)/i);
    if (mathMatch) {
      const a = parseFloat(mathMatch[1]);
      const op = mathMatch[2];
      const b = parseFloat(mathMatch[3]);
      let calcRes: number | null = null;
      if (op === '+') calcRes = a + b;
      else if (op === '-') calcRes = a - b;
      else if (op === '*') calcRes = a * b;
      else if (op === '/' && b !== 0) calcRes = a / b;
      if (calcRes !== null) {
        replyTemplate = `The calculated answer is **${calcRes}**.\n\n$$\n${a} ${op === '*' ? '\\times' : op} ${b} = ${calcRes}\n$$\n\n*💡 Tip: Calculated via Offline Local Engine. For comprehensive answers to all questions, switch to Google Gemini in the top header.*`;
      }
    } else if (lowerPrompt.includes('privacy') || lowerPrompt.includes('security') || lowerPrompt.includes('encrypt') || lowerPrompt.includes('crypto')) {
      replyTemplate = MockAIService.MOCK_RESPONSES.privacy;
    } else if (lowerPrompt.includes('research') || lowerPrompt.includes('study') || lowerPrompt.includes('paper') || lowerPrompt.includes('thesis')) {
      replyTemplate = MockAIService.MOCK_RESPONSES.research;
    } else if (lowerPrompt.includes('code') || lowerPrompt.includes('script') || lowerPrompt.includes('function') || lowerPrompt.includes('typescript')) {
      replyTemplate = MockAIService.MOCK_RESPONSES.code;
    } else {
      replyTemplate = `${MockAIService.MOCK_RESPONSES.default}\n\n*💡 Note: You are currently running in **Offline Local Mock Mode**. To get answers for all questions using official **Google Gemini AI (gemini-3.8-flash)**, switch to "Google Gemini" in the top header.*`;
    }

    const words = replyTemplate.split(/(\s+)/);
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      const chunk = words[i];
      accumulated += chunk;
      onToken(chunk, accumulated);

      // Random delay between 15ms and 35ms for realistic human reading cadence
      const delay = Math.floor(Math.random() * 20) + 15;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    onComplete({
      content: accumulated,
      tokenCount: Math.ceil(accumulated.length / 4),
      modelName: 'Veyra Local Engine (Offline)',
    });
  }
}

export const mockAIService = new MockAIService();
