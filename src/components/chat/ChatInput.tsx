import {
  ArrowUp,
  FileText,
  FolderOpen,
  Languages,
  Loader2,
  Mic,
  Paperclip,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { usePrivacy } from '../../context/PrivacyContext';
import { useProjects } from '../../context/ProjectContext';
import { useToast } from '../../context/ToastContext';
import { SUPPORTED_VOICE_LANGUAGES, useVoice, type VoiceSessionInfo } from '../../context/VoiceContext';
import { formatFileSize } from '../../utils/fileValidators';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

const PROMPT_SUGGESTIONS = [
  'Analyze privacy trade-offs in local-first apps',
  'Draft research methodology for thesis',
  'Summarize key principles of GDPR Article 17',
  'Create outline for cryptographic notes',
];

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, disabled = false }) => {
  const [input, setInput] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const voiceSettingsRef = useRef<HTMLDivElement>(null);
  const baseTextRef = useRef<string>('');
  const inputRef = useRef<string>('');
  const disabledRef = useRef<boolean>(disabled);

  const { showToast } = useToast();
  const { aiEngine } = usePrivacy();
  const {
    isListening,
    micLevel,
    voiceLang,
    setVoiceLang,
    startListening,
    stopListening,
    cancelListening,
  } = useVoice();

  const {
    messages,
    activeConversationId,
    activeProjectId,
    uploadFile,
    files,
    attachedFiles,
    removeAttachedFile,
    storeFileInChat,
  } = useProjects();

  const conversationMessages = messages.filter((m) => m.conversationId === activeConversationId);
  const showSuggestions = conversationMessages.length <= 1;

  useEffect(() => {
    inputRef.current = input;
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  // Close picker and voice settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
      if (voiceSettingsRef.current && !voiceSettingsRef.current.contains(e.target as Node)) {
        setIsVoiceSettingsOpen(false);
      }
    };
    if (isPickerOpen || isVoiceSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPickerOpen, isVoiceSettingsOpen]);

  // Cancel any in-progress voice session if the composer unmounts (releases the mic)
  useEffect(() => {
    return () => cancelListening();
  }, [cancelListening]);

  const resetComposer = () => {
    setInput('');
    inputRef.current = '';
    baseTextRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Voice prompt finished (Stop clicked or user stopped speaking): submit straight to the AI
  const submitVoicePrompt = (transcript: string, info: VoiceSessionInfo) => {
    const textToSend = [baseTextRef.current, transcript.trim()].filter(Boolean).join(' ').trim();
    if (!textToSend) {
      const device = info.micLabel ? ` ("${info.micLabel}")` : '';
      let message: string;
      if (info.heardSound) {
        message = 'Could not recognize your words. Try speaking clearly, or check the selected voice language.';
      } else if (info.micHadAudio) {
        message = `Your microphone${device} is working, but this browser's speech recognition received no audio. Please use Google Chrome or Microsoft Edge (Brave, Opera and others don't support it).`;
      } else {
        message = `Your microphone${device} is silent. Select the correct input device and check it isn't muted in Windows Sound settings.`;
      }
      showToast(message, 'error');
      return;
    }
    if (disabledRef.current) {
      // A response is still generating; keep the transcript in the box for the user to send
      showToast('Please wait for the current answer to finish, then press send.', 'info');
      return;
    }
    onSendMessage(textToSend);
    resetComposer();
  };

  const submitVoicePromptRef = useRef(submitVoicePrompt);
  useEffect(() => {
    submitVoicePromptRef.current = submitVoicePrompt;
  });

  const startVoiceRecognition = async () => {
    if (disabled) return;

    // Keep any text already typed so speech appends seamlessly
    baseTextRef.current = inputRef.current.trim();

    await startListening({
      onTranscript: (transcript) => {
        const nextText = [baseTextRef.current, transcript].filter(Boolean).join(' ');
        setInput(nextText);
        inputRef.current = nextText;
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      },
      // Read through a ref so the latest onSendMessage/state is used when the session ends
      onComplete: (transcript, info) => submitVoicePromptRef.current(transcript, info),
    });
  };

  const toggleVoiceRecognition = () => {
    if (disabled) return;
    if (isListening) {
      stopListening();
    } else {
      startVoiceRecognition();
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputRef.current.trim();
    if (!textToSend || disabled) return;

    // Typed submit while dictating: discard the voice session, send what's in the box
    if (isListening) cancelListening();

    onSendMessage(textToSend);
    resetComposer();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleApplySuggestion = (text: string) => {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const targetProjId = activeProjectId || 'personal-workspace';
      setIsUploading(true);
      try {
        for (let i = 0; i < e.target.files.length; i++) {
          const file = e.target.files[i];
          const saved = await uploadFile(targetProjId, file);
          if (saved) {
            await storeFileInChat(saved);
          }
        }
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  // Available files in this project that are not yet attached
  const projectFiles = files.filter((f) => f.projectId === activeProjectId);
  const unattachedFiles = projectFiles.filter(
    (f) => !attachedFiles.some((att) => att.id === f.id)
  );

  return (
    <div className="p-4 bg-white/80 border-t border-stone-200/80 backdrop-blur-xs relative">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleAttachFile}
      />

      {/* Suggestion Pills */}
      {showSuggestions && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-2 scrollbar-none">
          <div className="flex items-center gap-1 text-[11px] text-stone-400 font-medium shrink-0 mr-1">
            <Sparkles size={12} className="text-indigo-600" />
            <span>Prompt Starters:</span>
          </div>
          {PROMPT_SUGGESTIONS.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleApplySuggestion(suggestion)}
              className="text-[11px] px-3 py-1 rounded-full bg-stone-100 hover:bg-stone-200/80 border border-stone-200 text-stone-700 hover:text-stone-900 shrink-0 transition-colors cursor-pointer"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Attached Files Bar */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 mb-2 bg-stone-50 rounded-xl border border-stone-200/90 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-stone-600 mr-1">
            <Paperclip size={12} className="text-indigo-600" />
            <span>Attached to prompt:</span>
          </div>
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white border border-stone-200 text-xs text-stone-800 shadow-2xs"
            >
              <FileText size={12} className="text-indigo-600 shrink-0" />
              <span className="truncate max-w-[170px] font-medium">{file.name}</span>
              <span className="text-[10px] text-stone-400 font-normal">
                ({formatFileSize(file.size)})
              </span>
              <button
                type="button"
                onClick={() => removeAttachedFile(file.id)}
                className="text-stone-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                title="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Box */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-white border border-stone-300/80 rounded-2xl focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all p-2.5 shadow-xs"
      >
        {/* Active Voice Listening Banner */}
        {isListening && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 mb-2.5 bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 border border-rose-300/80 rounded-2xl text-rose-900 text-xs shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3.5 w-3.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-600"></span>
              </span>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-xs flex items-center gap-1.5 text-rose-950">
                  <Mic size={14} className="text-rose-600 animate-pulse shrink-0" />
                  Voice Prompt Active
                  {/* Live mic input level: should bounce while you speak */}
                  <span
                    className="ml-1 w-16 h-1.5 rounded-full bg-rose-200 overflow-hidden"
                    title="Microphone input level"
                  >
                    <span
                      className="block h-full bg-rose-600 transition-[width] duration-100"
                      style={{ width: `${Math.round(micLevel * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="text-[11px] text-rose-700/90 truncate font-medium">
                  Listening... Pause speaking or press &quot;Stop Voice Prompt&quot; to send
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={stopListening}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs hover:shadow-sm cursor-pointer transition-all active:scale-95"
                title="Stop voice prompt, think for answer, and generate response"
              >
                <Square size={11} className="fill-white" />
                <span>Stop Voice Prompt</span>
              </button>

              <button
                type="button"
                onClick={cancelListening}
                className="px-2.5 py-1.5 rounded-xl text-rose-700 hover:text-stone-700 hover:bg-rose-200/50 text-xs font-medium cursor-pointer transition-colors"
                title="Cancel voice input without generating answer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            isListening
              ? '🎙️ Listening to your words in real time... (Click "Stop Voice Prompt" to generate answer)'
              : attachedFiles.length > 0
              ? 'Ask questions about your attached document(s)...'
              : 'Ask Veyra AI anything or synthesize project notes... (Shift + Enter for new line)'
          }
          className="w-full bg-transparent text-xs text-stone-900 placeholder-stone-400 resize-none focus:outline-none px-2 py-1 max-h-40 leading-relaxed disabled:opacity-50"
        />

        <div className="flex items-center justify-between pt-2 px-1 border-t border-stone-100">
          <div className="flex items-center gap-1.5">
            {/* Direct Upload Button */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-stone-500 hover:text-indigo-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
              title="Upload and attach local file"
            >
              {isUploading ? (
                <Loader2 size={14} className="animate-spin text-indigo-600" />
              ) : (
                <Paperclip size={14} />
              )}
              <span className="hidden sm:inline">Attach File</span>
            </button>

            {/* Attach Existing Workspace File Dropdown Trigger */}
            {projectFiles.length > 0 && (
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(!isPickerOpen)}
                  className="p-1.5 text-stone-500 hover:text-indigo-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                  title="Attach an existing file from this project"
                >
                  <FolderOpen size={14} />
                  <span className="hidden sm:inline">Workspace Files ({projectFiles.length})</span>
                </button>

                {/* Workspace Files Popover */}
                {isPickerOpen && (
                  <div className="absolute left-0 bottom-full mb-2 w-72 bg-white rounded-xl shadow-lg border border-stone-200 p-2 z-50 animate-in fade-in">
                    <div className="text-[11px] font-semibold text-stone-700 px-2 py-1 border-b border-stone-100 flex items-center justify-between">
                      <span>Attach from Project Workspace:</span>
                      <button
                        onClick={() => setIsPickerOpen(false)}
                        className="text-stone-400 hover:text-stone-700 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto py-1 space-y-1">
                      {unattachedFiles.length === 0 ? (
                        <div className="text-center py-3 text-[11px] text-stone-400">
                          {projectFiles.length === 0
                            ? 'No files in workspace yet'
                            : 'All project files are already attached'}
                        </div>
                      ) : (
                        unattachedFiles.map((file) => (
                          <div
                            key={file.id}
                            onClick={async () => {
                              await storeFileInChat(file);
                              setIsPickerOpen(false);
                            }}
                            onDoubleClick={async () => {
                              await storeFileInChat(file);
                              setIsPickerOpen(false);
                            }}
                            title="Click or double-click to store in Chatbot"
                            className="flex items-center justify-between p-1.5 rounded-lg hover:bg-indigo-50/70 hover:text-indigo-900 text-stone-700 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0 mr-2">
                              <FileText size={12} className="text-stone-400 shrink-0" />
                              <span className="text-xs truncate">{file.name}</span>
                            </div>
                            <span className="text-[10px] text-stone-400 shrink-0">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Voice Prompt Command Button */}
            <button
              type="button"
              disabled={disabled}
              onClick={toggleVoiceRecognition}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold ${
                isListening
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs animate-pulse ring-2 ring-rose-400/60'
                  : 'text-stone-500 hover:text-indigo-600 hover:bg-stone-100'
              }`}
              title={
                isListening
                  ? 'Press to stop voice prompt and generate answer'
                  : 'Voice prompt command (Speech-to-Text)'
              }
            >
              {isListening ? (
                <Square size={13} className="fill-white text-white" />
              ) : (
                <Mic size={14} className="text-stone-500" />
              )}
              <span className="hidden sm:inline">
                {isListening ? 'Stop Voice Prompt' : 'Voice Prompt'}
              </span>
            </button>

            {/* Voice Language Selector & Audio Options Trigger */}
            <div className="relative" ref={voiceSettingsRef}>
              <button
                type="button"
                onClick={() => setIsVoiceSettingsOpen(!isVoiceSettingsOpen)}
                className="p-1.5 text-stone-500 hover:text-indigo-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                title={`Voice Language: ${SUPPORTED_VOICE_LANGUAGES.find((l) => l.code === voiceLang)?.name || 'English'}`}
              >
                <Languages size={14} />
                <span className="hidden sm:inline">
                  {SUPPORTED_VOICE_LANGUAGES.find((l) => l.code === voiceLang)?.flag || '🌐'}{' '}
                  {SUPPORTED_VOICE_LANGUAGES.find((l) => l.code === voiceLang)?.name.split(' ')[0] || 'English'}
                </span>
              </button>

              {isVoiceSettingsOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-64 bg-white rounded-xl shadow-lg border border-stone-200 p-2.5 z-50 animate-in fade-in">
                  <div className="text-[11px] font-semibold text-stone-700 pb-1.5 mb-1.5 border-b border-stone-100 flex items-center justify-between">
                    <span>Voice Settings</span>
                    <button
                      type="button"
                      onClick={() => setIsVoiceSettingsOpen(false)}
                      className="text-stone-400 hover:text-stone-700 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-1 px-1">
                    Recognition & Voice Language
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-0.5 mb-2">
                    {SUPPORTED_VOICE_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setVoiceLang(lang.code);
                          setIsVoiceSettingsOpen(false);
                          showToast(`Voice language set to ${lang.name}`, 'info');
                        }}
                        className={`w-full flex items-center justify-between p-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          voiceLang === lang.code
                            ? 'bg-indigo-50 text-indigo-900 font-semibold'
                            : 'text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{lang.flag}</span>
                          <span>{lang.name}</span>
                        </span>
                        {voiceLang === lang.code && (
                          <span className="text-[10px] text-indigo-600 font-bold">Active</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {aiEngine !== 'mock' ? (
              <span className="text-[10px] text-indigo-700/80 font-medium hidden md:inline ml-1">
                ✨ Google Gemini (gemini-3.8-flash) • Zero server logs
              </span>
            ) : (
              <span className="text-[10px] text-emerald-700 font-medium hidden md:inline ml-1">
                🔒 Local Mock • Fully Offline
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={!input.trim() || disabled}
            className="w-7 h-7 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs shadow-indigo-600/20"
          >
            {disabled ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      </form>
    </div>
  );
};
