import { AppLayout } from './components/layout/AppLayout';
import { AuthProvider } from './context/AuthContext';
import { PrivacyProvider } from './context/PrivacyContext';
import { ProjectProvider } from './context/ProjectContext';
import { ToastProvider } from './context/ToastContext';
import { VoiceProvider } from './context/VoiceContext';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <PrivacyProvider>
          <ProjectProvider>
            <VoiceProvider>
              <AppLayout />
            </VoiceProvider>
          </ProjectProvider>
        </PrivacyProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
