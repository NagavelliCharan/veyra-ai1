import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Paperclip,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import React, { useState } from 'react';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming = false }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Safe light-theme markdown rendering
  const renderFormattedContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const language = lines[0].match(/^[a-z]+/i) ? lines[0] : '';
        const code = language ? lines.slice(1).join('\n') : lines.join('\n');

        return (
          <div
            key={index}
            className="my-3 rounded-xl overflow-hidden border border-stone-200 bg-stone-900 font-mono text-xs shadow-xs"
          >
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-stone-950 border-b border-stone-800 text-stone-400">
              <span className="text-[11px] font-medium text-stone-300">
                {language || 'code'}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(code)}
                className="hover:text-white transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <Copy size={12} />
                <span>Copy</span>
              </button>
            </div>
            <pre className="p-3.5 overflow-x-auto text-stone-100 leading-relaxed whitespace-pre-wrap">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      const lines = part.split('\n');
      return (
        <div key={index} className="space-y-1.5">
          {lines.map((line, lIdx) => {
            if (line.startsWith('### ')) {
              return (
                <h4 key={lIdx} className="text-sm font-bold text-stone-900 mt-3 mb-1 tracking-tight">
                  {line.replace('### ', '')}
                </h4>
              );
            }
            if (line.startsWith('#### ')) {
              return (
                <h5 key={lIdx} className="text-xs font-semibold text-stone-900 mt-2 mb-0.5">
                  {line.replace('#### ', '')}
                </h5>
              );
            }
            if (line.startsWith('- ') || line.startsWith('* ')) {
              return (
                <div key={lIdx} className="flex items-start gap-2 ml-2 text-xs text-stone-700 leading-normal">
                  <span className="text-indigo-600 mt-0.5">•</span>
                  <span>{formatInlineMarkdown(line.slice(2))}</span>
                </div>
              );
            }
            if (line.startsWith('> ')) {
              return (
                <blockquote
                  key={lIdx}
                  className="pl-3 border-l-2 border-indigo-400 text-xs italic text-stone-600 my-1 bg-stone-50/50 py-0.5 rounded-r"
                >
                  {formatInlineMarkdown(line.slice(2))}
                </blockquote>
              );
            }
            if (!line.trim()) {
              return <div key={lIdx} className="h-1" />;
            }
            return (
              <p key={lIdx} className="text-xs leading-relaxed text-stone-700">
                {formatInlineMarkdown(line)}
              </p>
            );
          })}
        </div>
      );
    });
  };

  const formatInlineMarkdown = (text: string) => {
    const boldAndCode = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return boldAndCode.map((chunk, i) => {
      if (chunk.startsWith('**') && chunk.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-stone-900">
            {chunk.slice(2, -2)}
          </strong>
        );
      }
      if (chunk.startsWith('`') && chunk.endsWith('`')) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded bg-stone-100 text-indigo-700 font-mono text-[11px] border border-stone-200/60"
          >
            {chunk.slice(1, -1)}
          </code>
        );
      }
      return chunk;
    });
  };

  return (
    <div
      className={`group flex gap-3 p-4 rounded-2xl transition-all ${
        isUser
          ? 'bg-stone-100/90 border border-stone-200/70 ml-auto max-w-2xl'
          : 'bg-white border border-stone-200/90 shadow-2xs max-w-3xl'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center text-xs font-medium shadow-2xs ${
          isUser
            ? 'bg-stone-200 text-stone-700 border border-stone-300/80'
            : 'bg-indigo-600 text-white'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-900">
              {isUser ? 'You' : 'Veyra AI'}
            </span>
            {!isUser && (
              message.metadata?.modelName?.includes('Notice') ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/70">
                  <AlertTriangle size={10} className="text-amber-600" />
                  Groq Gateway Notice
                </span>
              ) : message.metadata?.modelName && !message.metadata?.modelName.toLowerCase().includes('mock') ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-indigo-800 font-medium bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/70">
                  <Sparkles size={10} className="text-indigo-600" />
                  {message.metadata.modelName.includes('gpt-oss')
                    ? 'GPT-OSS 120B (Groq Cloud)'
                    : message.metadata.modelName.includes('llama')
                    ? 'Llama 3.3 (Groq Cloud)'
                    : `${message.metadata.modelName} (Groq Cloud)`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/70">
                  <Shield size={10} className="text-emerald-600" />
                  Local Mock (Offline)
                </span>
              )
            )}
            <span className="text-[10px] text-stone-400">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-stone-700 rounded transition-all cursor-pointer"
            title="Copy message"
          >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
          </button>
        </div>

        {/* Attached Referenced Files Badges */}
        {message.metadata?.referencedFiles && message.metadata.referencedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.metadata.referencedFiles.map((fileName, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-50/80 border border-indigo-200/80 text-[11px] font-medium text-indigo-900 shadow-2xs"
              >
                <Paperclip size={11} className="text-indigo-600 shrink-0" />
                <span className="truncate max-w-[220px]">{fileName}</span>
              </span>
            ))}
          </div>
        )}

        <div className="text-xs text-stone-800">
          {renderFormattedContent(message.content)}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-indigo-600 ml-1 animate-pulse align-middle rounded-xs" />
          )}
        </div>

        {message.metadata && (
          <div className="mt-2 text-[10px] text-stone-400 flex items-center gap-2">
            {message.metadata.tokenCount ? <span>~{message.metadata.tokenCount} tokens</span> : null}
            {message.metadata.tokenCount ? <span>•</span> : null}
            {message.metadata?.modelName?.includes('Notice') ? (
              <span className="text-amber-700/80 font-medium">Gateway Service Notice</span>
            ) : message.metadata?.modelName && !message.metadata?.modelName.toLowerCase().includes('mock') ? (
              <span className="text-indigo-600/80 font-medium">Groq Cloud AI • Zero server logs</span>
            ) : (
              <span className="text-emerald-700/80 font-medium">Local Mock Engine • 0 B Outbound</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
