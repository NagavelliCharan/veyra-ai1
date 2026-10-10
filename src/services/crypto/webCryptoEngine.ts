/**
 * Web Crypto API Engine for Veyra AI
 *
 * Implements authenticated encryption and key derivation strictly using
 * standard W3C Web Cryptography API primitives:
 * - PBKDF2 (HMAC-SHA-256) with 100,000 iterations
 * - AES-GCM (256-bit) with fresh 12-byte (96-bit) cryptographically random IV per operation
 * - Non-extractable CryptoKey to prevent in-memory key dumping
 *
 * Security & Threat Disclosures:
 * - Authenticated encryption guarantees confidentiality and integrity of records at rest.
 * - IndexedDB alone is plaintext; this engine ensures only ciphertext is persisted.
 * - This does NOT prevent attacks from compromised browser extensions, DOM injection,
 *   or memory scrapers on an infected host OS.
 * - Zero recovery: Without the master passphrase, derived ciphertext cannot be recovered.
 */

export const PBKDF2_ITERATIONS = 100000;
export const SALT_BYTE_LENGTH = 16; // 128-bit salt
export const IV_BYTE_LENGTH = 12; // 96-bit standard AES-GCM IV
export const CANARY_PLAINTEXT = 'PRIVY_AI_VAULT_CANARY_VALID_v1';
export const ENCRYPTED_PREFIX = 'PRIVY_ENC:';

export class VaultLockedError extends Error {
  constructor(message = 'The encrypted workspace is locked. Passphrase required.') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

export class InvalidPassphraseError extends Error {
  constructor(message = 'Incorrect master passphrase. Authentication challenge failed.') {
    super(message);
    this.name = 'InvalidPassphraseError';
  }
}

export class CiphertextIntegrityError extends Error {
  constructor(message = 'Ciphertext verification failed. Data may be corrupted or tampered with.') {
    super(message);
    this.name = 'CiphertextIntegrityError';
  }
}

export interface EncryptedEnvelope {
  version: 1;
  iv: string; // Base64 12 bytes
  ciphertext: string; // Base64 ciphertext + 16-byte auth tag
}

// Byte <-> Base64 safe conversions for Browser & Node
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: BufferSource): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Generate cryptographically secure random salt
 */
export function generateRandomSalt(byteLength = SALT_BYTE_LENGTH): Uint8Array {
  const salt = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(salt);
  return salt;
}

/**
 * Derive an AES-GCM 256-bit key from a passphrase and salt using PBKDF2.
 * The derived key is non-extractable (extractable: false) to mitigate key dumping.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const passphraseBytes = utf8Encode(passphrase);

  // 1. Import raw passphrase as PBKDF2 key material
  const baseKey = await subtle.importKey(
    'raw',
    passphraseBytes as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // 2. Derive AES-GCM 256-bit encryption key
  const derivedKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // extractable = false prevents raw key extraction
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * Encrypt a plaintext string using AES-GCM with a fresh random IV.
 * Returns a serialized self-describing envelope string prefixed with 'PRIVY_ENC:'.
 */
export async function encryptString(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const subtle = globalThis.crypto.subtle;

  // Generate fresh, cryptographically random 12-byte IV for every encryption call
  const iv = new Uint8Array(IV_BYTE_LENGTH);
  globalThis.crypto.getRandomValues(iv);

  const plainBytes = utf8Encode(plaintext);
  const encryptedBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    plainBytes as unknown as BufferSource
  );

  const envelope: EncryptedEnvelope = {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };

  return `${ENCRYPTED_PREFIX}${JSON.stringify(envelope)}`;
}

/**
 * Decrypt an envelope string using AES-GCM.
 * If the input is not encrypted, returns it unchanged (supports backwards compatibility).
 */
export async function decryptString(
  payloadString: string,
  key: CryptoKey
): Promise<string> {
  if (!isEncryptedString(payloadString)) {
    return payloadString;
  }

  const subtle = globalThis.crypto.subtle;
  const jsonStr = payloadString.slice(ENCRYPTED_PREFIX.length);

  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(jsonStr);
  } catch {
    throw new CiphertextIntegrityError('Malformed encrypted envelope JSON.');
  }

  if (envelope.version !== 1 || !envelope.iv || !envelope.ciphertext) {
    throw new CiphertextIntegrityError('Unsupported or invalid envelope format.');
  }

  const iv = base64ToBytes(envelope.iv);
  const ciphertextBytes = base64ToBytes(envelope.ciphertext);

  try {
    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      key,
      ciphertextBytes as unknown as BufferSource
    );

    return utf8Decode(decryptedBuffer);
  } catch {
    // Web Crypto throws OperationError on authentication tag mismatch or corrupted ciphertext
    throw new CiphertextIntegrityError('Authentication verification failed: ciphertext is invalid or tampered.');
  }
}

/**
 * Checks whether a given string is an encrypted Privy envelope
 */
export function isEncryptedString(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith(ENCRYPTED_PREFIX);
}
