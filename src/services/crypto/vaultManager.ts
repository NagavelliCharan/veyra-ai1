import {
  base64ToBytes,
  bytesToBase64,
  CANARY_PLAINTEXT,
  decryptString,
  deriveKeyFromPassphrase,
  encryptString,
  generateRandomSalt,
  InvalidPassphraseError,
  PBKDF2_ITERATIONS,
  VaultLockedError,
} from './webCryptoEngine.ts';
import { privyDb, type PrivyDatabase } from '../storage/privyDatabase.ts';

export const VAULT_SETTING_SALT = 'vault_salt';
export const VAULT_SETTING_CANARY = 'vault_canary';
export const VAULT_SETTING_ITERATIONS = 'vault_iterations';

export interface VaultState {
  isConfigured: boolean;
  isUnlocked: boolean;
  iterations: number;
}

type VaultListener = (state: VaultState) => void;

/**
 * VaultManager coordinates key lifecycle and authentication challenges.
 *
 * Privacy Invariants:
 * 1. Plaintext passwords are NEVER stored in any persistent or session storage.
 * 2. Derived CryptoKeys are held in private volatile RAM only.
 * 3. Calling lock() or reloading the page resets the in-memory key to null.
 * 4. Passwords are never sent across the network or written to console logs.
 */
export class VaultManager {
  private unlockedKey: CryptoKey | null = null;
  private db: PrivyDatabase;
  private listeners = new Set<VaultListener>();

  constructor(customDb?: PrivyDatabase) {
    this.db = customDb || privyDb;
  }

  subscribe(listener: VaultListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.getState().then((state) => {
      this.listeners.forEach((cb) => cb(state));
    });
  }

  /**
   * Check if a vault has been configured in the database
   */
  async isConfigured(): Promise<boolean> {
    try {
      const saltRecord = await this.db.settings.get(VAULT_SETTING_SALT);
      const canaryRecord = await this.db.settings.get(VAULT_SETTING_CANARY);
      return Boolean(saltRecord?.value && canaryRecord?.value);
    } catch {
      return false;
    }
  }

  /**
   * Check if vault key is currently unlocked in memory
   */
  isUnlocked(): boolean {
    return this.unlockedKey !== null;
  }

  /**
   * Get current vault state
   */
  async getState(): Promise<VaultState> {
    const isConfigured = await this.isConfigured();
    return {
      isConfigured,
      isUnlocked: this.isUnlocked(),
      iterations: PBKDF2_ITERATIONS,
    };
  }

  /**
   * Returns in-memory key or throws if locked
   */
  getKey(): CryptoKey {
    if (!this.unlockedKey) {
      throw new VaultLockedError();
    }
    return this.unlockedKey;
  }

  /**
   * Setup a new vault with a master passphrase
   */
  async setupVault(passphrase: string): Promise<void> {
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Master passphrase must be at least 8 characters long.');
    }

    const salt = generateRandomSalt();
    const derivedKey = await deriveKeyFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS);
    const canaryEncrypted = await encryptString(CANARY_PLAINTEXT, derivedKey);
    const now = Date.now();

    await this.db.transaction('rw', this.db.settings, async () => {
      await this.db.settings.put({
        id: VAULT_SETTING_SALT,
        value: bytesToBase64(salt),
        updatedAt: now,
      });
      await this.db.settings.put({
        id: VAULT_SETTING_CANARY,
        value: canaryEncrypted,
        updatedAt: now,
      });
      await this.db.settings.put({
        id: VAULT_SETTING_ITERATIONS,
        value: String(PBKDF2_ITERATIONS),
        updatedAt: now,
      });
    });

    this.unlockedKey = derivedKey;
    this.notify();
  }

  /**
   * Unlock an existing vault with passphrase.
   * Derives candidate key, tests against canary, stores key in memory on success.
   */
  async unlockVault(passphrase: string): Promise<boolean> {
    const saltRecord = await this.db.settings.get(VAULT_SETTING_SALT);
    const canaryRecord = await this.db.settings.get(VAULT_SETTING_CANARY);
    const iterationsRecord = await this.db.settings.get(VAULT_SETTING_ITERATIONS);

    if (!saltRecord?.value || !canaryRecord?.value) {
      throw new Error('No encrypted vault configured on this device.');
    }

    const salt = base64ToBytes(saltRecord.value);
    const iterations = iterationsRecord?.value
      ? parseInt(iterationsRecord.value, 10)
      : PBKDF2_ITERATIONS;

    const candidateKey = await deriveKeyFromPassphrase(passphrase, salt, iterations);

    try {
      const decryptedCanary = await decryptString(canaryRecord.value, candidateKey);
      if (decryptedCanary !== CANARY_PLAINTEXT) {
        throw new InvalidPassphraseError();
      }

      this.unlockedKey = candidateKey;
      this.notify();
      return true;
    } catch {
      this.unlockedKey = null;
      throw new InvalidPassphraseError('Authentication failed: incorrect master passphrase.');
    }
  }

  /**
   * Lock the workspace: wipes the derived key from memory
   */
  lockVault(): void {
    this.unlockedKey = null;
    this.notify();
  }

  /**
   * Wipe vault settings (for emergency reset / panic wipe)
   */
  async resetVault(): Promise<void> {
    this.unlockedKey = null;
    await this.db.settings.bulkDelete([
      VAULT_SETTING_SALT,
      VAULT_SETTING_CANARY,
      VAULT_SETTING_ITERATIONS,
    ]);
    this.notify();
  }
}

export const vaultManager = new VaultManager();
