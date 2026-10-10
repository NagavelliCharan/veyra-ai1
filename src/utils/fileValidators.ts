// File Validation, Type Detection, and Parsing Utilities for Veyra AI

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 Megabytes

export type SupportedFileType = 'txt' | 'md' | 'pdf';

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileType: SupportedFileType | 'unknown';
}

export interface ParsedLocalFile {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  textPreview?: string;
}

/**
 * Validates file type and size.
 * Supported: Plain text (.txt), Markdown (.md, .markdown), and PDF (.pdf).
 */
export function validateFile(file: File | { name: string; size: number; type?: string }): FileValidationResult {
  // 1. Check size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds the 15 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a smaller file for browser storage.`,
      fileType: 'unknown',
    };
  }

  // 2. Check extension and MIME type
  const lowerName = file.name.toLowerCase();
  const mimeType = (file.type || '').toLowerCase();

  if (
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/x-markdown'
  ) {
    return { isValid: true, fileType: 'md' };
  }

  if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
    return { isValid: true, fileType: 'pdf' };
  }

  if (
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.log') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.js') ||
    lowerName.endsWith('.ts') ||
    lowerName.endsWith('.py') ||
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.css') ||
    lowerName.endsWith('.yml') ||
    lowerName.endsWith('.yaml') ||
    lowerName.endsWith('.xml') ||
    lowerName.endsWith('.sql') ||
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('csv')
  ) {
    return { isValid: true, fileType: 'txt' };
  }

  return {
    isValid: false,
    error: `Unsupported file format for "${file.name}". Veyra AI supports text documents (.txt, .md, code/data files) and PDF (.pdf).`,
    fileType: 'unknown',
  };
}

/**
 * Reads local file content safely into memory.
 * For text and markdown files, extracts readable textPreview.
 * For PDF files, generates a base64 Data URL.
 */
export async function readLocalFile(file: File): Promise<ParsedLocalFile> {
  const validation = validateFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid file');
  }

  const { fileType } = validation;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const nodeBuffer = (globalThis as unknown as { Buffer?: { from: (b: ArrayBuffer) => { toString: (enc: string) => string } } }).Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
  }
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  if (typeof atob === 'function') {
    return atob(base64);
  }
  const nodeBuffer = (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(base64, 'base64').toString('utf-8');
  }
  return '';
}

  // Read data URL (needed for export/download and PDF preview)
  let dataUrl = '';
  if (typeof FileReader !== 'undefined') {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
      reader.readAsDataURL(file);
    });
  } else if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mime = file.type || (fileType === 'pdf' ? 'application/pdf' : 'text/plain');
    dataUrl = `data:${mime};base64,${base64}`;
  } else {
    throw new Error(`File reading is not supported in this environment for "${file.name}"`);
  }

  let textPreview: string | undefined = undefined;

  if (fileType === 'txt' || fileType === 'md') {
    if (typeof file.text === 'function') {
      textPreview = await file.text();
    } else if (typeof FileReader !== 'undefined') {
      textPreview = await new Promise<string>((resolve, reject) => {
        const textReader = new FileReader();
        textReader.onload = () => resolve(textReader.result as string);
        textReader.onerror = () => reject(new Error(`Failed to extract text from "${file.name}"`));
        textReader.readAsText(file);
      });
    }

    // Detect binary files disguised as text (containing null bytes)
    if (textPreview && textPreview.includes('\0')) {
      throw new Error(`File "${file.name}" contains binary data and is not a valid plain text or Markdown file.`);
    }
  }

  // Verify PDF header magic bytes (%PDF)
  if (fileType === 'pdf' && file.size > 0) {
    try {
      const base64Data = dataUrl.split(',')[1] || '';
      const sample = base64Data.slice(0, 16);
      if (sample) {
        const rawHeader = base64ToUtf8(sample);
        if (rawHeader && !rawHeader.startsWith('%PDF')) {
          throw new Error(`File "${file.name}" is not a valid PDF document or contains corrupted headers (missing %PDF signature).`);
        }
      }
    } catch (err: any) {
      if (err.message?.includes('not a valid PDF')) throw err;
    }
  }

  let normalizedMime = file.type;
  if (!normalizedMime) {
    if (fileType === 'txt') normalizedMime = 'text/plain';
    else if (fileType === 'md') normalizedMime = 'text/markdown';
    else if (fileType === 'pdf') normalizedMime = 'application/pdf';
    else normalizedMime = 'application/octet-stream';
  }

  return {
    name: file.name,
    size: file.size,
    type: normalizedMime,
    dataUrl,
    textPreview,
  };
}

/**
 * Escapes raw HTML characters to prevent XSS and unsafe script execution.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper to format file byte sizes cleanly
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
