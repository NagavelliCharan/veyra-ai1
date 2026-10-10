// Minimal loader and types for Google Identity Services ("Sign in with Google")
// https://developers.google.com/identity/gsi/web/reference/js-reference

export interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
    use_fedcm_for_button?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

let loadPromise: Promise<GoogleAccountsId> | null = null;

export const loadGoogleIdentity = (): Promise<GoogleAccountsId> => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error('Google Identity Services failed to initialize'));
    };
    script.onerror = () => {
      loadPromise = null;
      script.remove();
      reject(new Error('Could not load Google sign-in. Check your internet connection.'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
};

/** Stops Google from silently re-selecting the last account after sign-out */
export const disableGoogleAutoSelect = () => {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // GIS not loaded; nothing to disable
  }
};
