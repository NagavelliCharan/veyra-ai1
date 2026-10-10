/**
 * Generates concise, human-readable conversation titles from the first user message
 * using purely deterministic local rules without calling external APIs.
 */
export function generateConversationTitle(message: string): string {
  if (!message || !message.trim()) {
    return 'New Conversation';
  }

  // 1. Strip markdown fences, URLs, and excess punctuation
  let text = message
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/`.*?`/g, '') // remove inline code
    .replace(/https?:\/\/\S+/g, '') // remove urls
    .replace(/[#*_\->~]/g, '') // remove markdown symbols
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return 'Code Snippet Inquiry';
  }

  // 2. Strip common conversational filler prefixes
  const prefixPatterns = [
    /^(can you please |can you |could you please |could you |please )/i,
    /^(i need you to |i want you to |i want to |i would like to )/i,
    /^(what is the |what is a |what is |what are the |what are )/i,
    /^(how do i |how can i |how does a |how does the |how does |how to |how )/i,
    /^(tell me about |explain to me |explain |describe |summarize |outline )/i,
    /^(write a |create a |draft a |generate a |give me a |give me )/i,
    /^(help me with |help me understand |help me )/i,
  ];

  let matched = true;
  while (matched) {
    matched = false;
    for (const pattern of prefixPatterns) {
      if (pattern.test(text)) {
        text = text.replace(pattern, '').trim();
        matched = true;
      }
    }
  }

  // 3. Remove trailing question marks or punctuation for clean title
  text = text.replace(/[?.!,:;]+$/, '').trim();

  if (!text) {
    return 'Research Query';
  }

  // 4. Word-boundary truncation at ~36 characters
  const MAX_LENGTH = 36;
  if (text.length > MAX_LENGTH) {
    const truncated = text.substring(0, MAX_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 16) {
      text = truncated.substring(0, lastSpace) + '...';
    } else {
      text = truncated + '...';
    }
  }

  // 5. Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  return text;
}
