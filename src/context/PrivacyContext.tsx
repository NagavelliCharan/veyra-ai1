import React, { createContext, useContext, useEffect, useState } from 'react';
import { dexieWorkspaceRepository } from '../services/storage/dexieWorkspaceRepository.ts';
import { vaultManager } from '../services/crypto/vaultManager.ts';
import { groqClient } from '../services/ai/groqClient.ts';
import type { StorageMode, StorageQuotaInfo } from '../types/index.ts';

export type AIEngine = 'groq' | 'gemini' | 'mock';

export interface MigrateStorageOptions {
  passphrase?: string;
  decryptExisting?: boolean;
  persistSessionData?: boolean;
}

export interface MigrateStorageResult {
  success: boolean;
  error?: string;
}

interface PrivacyContextType {
  storageMode: StorageMode;
  setStorageMode: (mode: StorageMode) => void;
  migrateStorageMode: (mode: StorageMode, options?: MigrateStorageOptions) => Promise<MigrateStorageResult>;
  clearAllData: () => Promise<void>;
  storageStats: {
    projectsCount: number;
    conversationsCount: number;
    messagesCount: number;
    notesCount: number;
    filesCount: number;
  };
  storageQuota: StorageQuotaInfo;
  refreshStats: () => Promise<void>;
  requestPersistentStorage: () => Promise<boolean>;

  // Cryptographic Vault State & Actions
  isVaultConfigured: boolean;
  isVaultLocked: boolean;
  setupVault: (passphrase: string) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<boolean>;
  lockVault: () => void;

  // AI Engine & Cloud Consent State
  aiEngine: AIEngine;
  setAiEngine: (engine: AIEngine) => void;
  hasGroqConsent: boolean;
  hasGeminiConsent: boolean; // Backward compatibility alias
  grantGroqConsent: (granted: boolean) => void;
  grantGeminiConsent: (granted: boolean) => void; // Backward compatibility alias
  groqServerStatus: {
    isOnline: boolean;
    groqConfigured: boolean;
    model: string;
  };
  geminiServerStatus: {
    isOnline: boolean;
    geminiConfigured: boolean;
    model: string;
  };
  checkGroqServer: () => Promise<void>;
  checkGeminiServer: () => Promise<void>;
}

const PrivacyContext = createContext<PrivacyContextType | null>(null);

const STORAGE_MODE_KEY = 'privy_ai_storage_mode';
const AI_ENGINE_KEY = 'privy_ai_engine';
const GROQ_CONSENT_KEY = 'privy_ai_groq_consent';
const GEMINI_CONSENT_KEY = 'privy_ai_gemini_consent';

const INITIAL_QUOTA: StorageQuotaInfo = {
  usageBytes: 0,
  quotaBytes: 0,
  percentageUsed: 0,
  isAvailable: true,
  isPersisted: false,
};

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Only non-sensitive preference settings are stored in localStorage
  const [storageMode, setStorageModeState] = useState<StorageMode>(() => {
    return (localStorage.getItem(STORAGE_MODE_KEY) as StorageMode) || 'local_storage';
  });

  const [aiEngine, setAiEngineState] = useState<AIEngine>(() => {
    const saved = localStorage.getItem(AI_ENGINE_KEY);
    if (saved === 'mock') return 'mock';
    if (saved === 'groq') return 'groq';
    return 'gemini';
  });

  const [hasGroqConsent, setHasGroqConsentState] = useState<boolean>(() => {
    return (
      localStorage.getItem(GROQ_CONSENT_KEY) === 'true' ||
      localStorage.getItem(GEMINI_CONSENT_KEY) === 'true'
    );
  });

  const [groqServerStatus, setGroqServerStatus] = useState<{
    isOnline: boolean;
    groqConfigured: boolean;
    model: string;
  }>({
    isOnline: false,
    groqConfigured: false,
    model: 'gemini-3.8-flash',
  });

  const [geminiServerStatus, setGeminiServerStatus] = useState<{
    isOnline: boolean;
    geminiConfigured: boolean;
    model: string;
  }>({
    isOnline: false,
    geminiConfigured: false,
    model: 'gemini-3.8-flash',
  });

  const [isVaultConfigured, setIsVaultConfigured] = useState<boolean>(false);
  const [isVaultLocked, setIsVaultLocked] = useState<boolean>(true);

  const [storageStats, setStorageStats] = useState({
    projectsCount: 0,
    conversationsCount: 0,
    messagesCount: 0,
    notesCount: 0,
    filesCount: 0,
  });

  const [storageQuota, setStorageQuota] = useState<StorageQuotaInfo>(INITIAL_QUOTA);

  const checkGroqServer = async () => {
    const status = await groqClient.checkHealth();
    setGroqServerStatus({
      isOnline: status.isOnline,
      groqConfigured: status.groqConfigured,
      model: status.model,
    });
    setGeminiServerStatus({
      isOnline: status.isOnline,
      geminiConfigured: status.geminiConfigured,
      model: status.model,
    });
  };

  const checkGeminiServer = checkGroqServer;

  // Initialize vault & server checks
  useEffect(() => {
    vaultManager.isConfigured().then((configured) => {
      setIsVaultConfigured(configured);
      const unlocked = vaultManager.isUnlocked();
      setIsVaultLocked(!unlocked);
    });

    const unsubscribe = vaultManager.subscribe((state) => {
      setIsVaultConfigured(state.isConfigured);
      setIsVaultLocked(!state.isUnlocked);
    });

    checkGroqServer();
    const interval = setInterval(checkGroqServer, 15000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const refreshStats = async () => {
    try {
      const quota = await dexieWorkspaceRepository.getStorageQuota();
      setStorageQuota(quota);

      if (storageMode === 'encrypted' && !vaultManager.isUnlocked()) {
        return;
      }

      const projects = await dexieWorkspaceRepository.getProjects();
      const conversations = await dexieWorkspaceRepository.getConversations();

      setStorageStats((prev) => ({
        ...prev,
        projectsCount: projects.length,
        conversationsCount: conversations.length,
      }));
    } catch {
      // Gracefully ignore during locked state
    }
  };

  useEffect(() => {
    dexieWorkspaceRepository.setMode(storageMode);
    refreshStats();
  }, [storageMode, isVaultLocked]);

  const setStorageMode = (mode: StorageMode) => {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
    setStorageModeState(mode);
    dexieWorkspaceRepository.setMode(mode);
  };

  const migrateStorageMode = async (
    targetMode: StorageMode,
    options?: MigrateStorageOptions
  ): Promise<MigrateStorageResult> => {
    try {
      if (targetMode === storageMode) {
        return { success: true };
      }

      // Case 1: Migrating to Encrypted Vault
      if (targetMode === 'encrypted') {
        const configured = await vaultManager.isConfigured();
        if (!configured) {
          if (!options?.passphrase) {
            return {
              success: false,
              error: 'A master passphrase is required to initialize the Encrypted Vault.',
            };
          }
          await vaultManager.setupVault(options.passphrase);
          const key = vaultManager.getKey();
          if (options.persistSessionData && storageMode === 'session_only') {
            await dexieWorkspaceRepository.persistSessionDataToStorage(key);
          } else {
            await dexieWorkspaceRepository.encryptAllPlaintextData(key);
          }
          setStorageMode('encrypted');
          setIsVaultConfigured(true);
          setIsVaultLocked(false);
          await refreshStats();
          return { success: true };
        }

        // Vault is configured; check if locked
        if (!vaultManager.isUnlocked()) {
          if (!options?.passphrase) {
            return {
              success: false,
              error: 'Vault passphrase required to unlock and encrypt existing data.',
            };
          }
          const unlocked = await vaultManager.unlockVault(options.passphrase);
          if (!unlocked) {
            return {
              success: false,
              error: 'Incorrect passphrase. Could not unlock vault for migration.',
            };
          }
          setIsVaultLocked(false);
        }

        const key = vaultManager.getKey();
        if (options?.persistSessionData && storageMode === 'session_only') {
          await dexieWorkspaceRepository.persistSessionDataToStorage(key);
        } else {
          await dexieWorkspaceRepository.encryptAllPlaintextData(key);
        }
        setStorageMode('encrypted');
        await refreshStats();
        return { success: true };
      }

      // Case 2: Migrating to Local Persistence
      if (targetMode === 'local_storage') {
        if (storageMode === 'encrypted') {
          // If vault is locked, require passphrase to decrypt
          if (!vaultManager.isUnlocked()) {
            if (!options?.passphrase) {
              return {
                success: false,
                error: 'Vault passphrase required to authorize decrypting records.',
              };
            }
            const unlocked = await vaultManager.unlockVault(options.passphrase);
            if (!unlocked) {
              return {
                success: false,
                error: 'Incorrect passphrase. Cannot authorize decryption.',
              };
            }
            setIsVaultLocked(false);
          }

          if (options?.decryptExisting) {
            const key = vaultManager.getKey();
            await dexieWorkspaceRepository.decryptAllEncryptedData(key);
          }
        } else if (storageMode === 'session_only') {
          if (options?.persistSessionData) {
            await dexieWorkspaceRepository.persistSessionDataToStorage();
          }
        }

        setStorageMode('local_storage');
        await refreshStats();
        return { success: true };
      }

      // Case 3: Migrating to Session-Only
      if (targetMode === 'session_only') {
        await dexieWorkspaceRepository.loadMemoryFromStorage();
        setStorageMode('session_only');
        await refreshStats();
        return { success: true };
      }

      return { success: false, error: 'Unknown target storage mode.' };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Storage mode migration failed.',
      };
    }
  };

  const setAiEngine = (engine: AIEngine) => {
    localStorage.setItem(AI_ENGINE_KEY, engine);
    setAiEngineState(engine);
  };

  const grantGroqConsent = (granted: boolean) => {
    localStorage.setItem(GROQ_CONSENT_KEY, String(granted));
    localStorage.setItem(GEMINI_CONSENT_KEY, String(granted));
    setHasGroqConsentState(granted);
  };

  const grantGeminiConsent = grantGroqConsent;

  const setupVault = async (passphrase: string): Promise<void> => {
    await vaultManager.setupVault(passphrase);
    const key = vaultManager.getKey();
    await dexieWorkspaceRepository.encryptAllPlaintextData(key);
    setStorageMode('encrypted');
    setIsVaultConfigured(true);
    setIsVaultLocked(false);
    await refreshStats();
  };

  const unlockVault = async (passphrase: string): Promise<boolean> => {
    const success = await vaultManager.unlockVault(passphrase);
    if (success) {
      setIsVaultLocked(false);
      await refreshStats();
    }
    return success;
  };

  const lockVault = (): void => {
    vaultManager.lockVault();
    setIsVaultLocked(true);
  };

  const clearAllData = async (): Promise<void> => {
    try {
      await dexieWorkspaceRepository.clearAll();
      localStorage.removeItem(STORAGE_MODE_KEY);
      localStorage.removeItem(AI_ENGINE_KEY);
      localStorage.removeItem(GROQ_CONSENT_KEY);
      localStorage.removeItem(GEMINI_CONSENT_KEY);
      sessionStorage.clear();
      if (typeof window !== 'undefined' && 'indexedDB' in window) {
        try {
          window.indexedDB.deleteDatabase('privy_ai_db');
        } catch {
          // Ignore
        }
      }
      setStorageModeState('local_storage');
      setIsVaultConfigured(false);
      setIsVaultLocked(true);
      setHasGroqConsentState(false);
      setAiEngineState('groq');
      if (typeof window !== 'undefined' && window.location?.reload) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to clear local data:', err);
    }
  };

  const requestPersistentStorage = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      await refreshStats();
      return granted;
    }
    return false;
  };

  return (
    <PrivacyContext.Provider
      value={{
        storageMode,
        setStorageMode,
        migrateStorageMode,
        clearAllData,
        storageStats,
        storageQuota,
        refreshStats,
        requestPersistentStorage,
        isVaultConfigured,
        isVaultLocked,
        setupVault,
        unlockVault,
        lockVault,
        aiEngine,
        setAiEngine,
        hasGroqConsent,
        hasGeminiConsent: hasGroqConsent,
        grantGroqConsent,
        grantGeminiConsent,
        groqServerStatus,
        geminiServerStatus,
        checkGroqServer,
        checkGeminiServer,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};
