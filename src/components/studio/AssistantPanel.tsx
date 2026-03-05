"use client";

import React, { useRef, useEffect, useState } from 'react';
import { X, Eraser, Copy, CornerDownLeft, Loader2, Sparkles, Brain, PenLine, Wand2, Image as ImageIcon, Film, Upload, XCircle } from 'lucide-react';
import { uploadToCos, buildMediaPath } from '@/services/cosStorage';

// 使用统一的 Chat API
interface ChatAttachment {
  id: string;
  type: 'image' | 'video';
  url: string;
  name?: string;
}

const DEFAULT_CHAT_MODEL = 'gemini-3-flash-preview';
const THINKING_CHAT_MODEL = 'gemini-3.1-pro-preview';

const sendChatMessage = async (
  history: { role: 'user' | 'model', text: string }[],
  newMessage: string,
  options?: {
    isThinkingMode?: boolean;
    isStoryboard?: boolean;
    isHelpMeWrite?: boolean;
    model?: string;
    attachments?: ChatAttachment[];
  }
): Promise<string> => {
  const messages = [
    ...history,
    { role: 'user' as const, text: newMessage }
  ];

  // 确定模式
  let mode = 'default';
  if (options?.isHelpMeWrite) mode = 'prompt_enhancer';
  else if (options?.isStoryboard) mode = 'storyboard';

  const response = await fetch('/api/studio/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      mode,
      model: options?.model,
      attachments: options?.attachments || []
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API错误: ${response.status}`);
  }

  const result = await response.json();
  return result.message || '无响应';
};

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface ExternalChatAsset {
  id: string;
  type: 'image' | 'video';
  url: string;
  name?: string;
}

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  externalDragState?: { active: boolean; over: boolean };
  externalIncomingAsset?: ExternalChatAsset | null;
  onExternalIncomingAssetHandled?: () => void;
}

// --- Rich Text Rendering Helpers ---

const parseInlineStyles = (text: string): React.ReactNode[] => {
  // Regex to split by bold (**text**)
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2);
      // Highlight key values or important labels with brighter white/cyan
      return <span key={i} className="text-slate-900 dark:text-slate-100 font-bold mx-0.5">{content}</span>;
    }
    return part;
  });
};

const renderFormattedMessage = (text: string) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, index) => {
    const key = `line-${index}`;
    const trimmed = line.trim();

    // Empty lines
    if (!trimmed) {
      elements.push(<div key={key} className="h-2" />);
      return;
    }

    // H1 (# Title)
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key} className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mt-5 mb-3 border-b border-slate-300 dark:border-slate-600 pb-2">
          {line.replace(/^#\s/, '')}
        </h1>
      );
      return;
    }

    // H2 (## Title)
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key} className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-4 mb-2 flex items-center gap-2">
          <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
          {line.replace(/^##\s/, '')}
        </h2>
      );
      return;
    }

    // H3/H4 (### Title)
    if (line.startsWith('### ') || line.startsWith('#### ')) {
      const content = line.replace(/^#+\s/, '');
      elements.push(
        <h3 key={key} className="text-xs font-bold text-blue-500 dark:text-blue-300 mt-3 mb-1 uppercase tracking-wider">
          {content}
        </h3>
      );
      return;
    }

    // List Items (* Item or - Item)
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const content = trimmed.replace(/^[\*\-]\s/, '');
      elements.push(
        <div key={key} className="flex gap-2 ml-1 mb-1.5 items-start group/list">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mt-[7px] shrink-0 group-hover/list:bg-cyan-400 transition-colors" />
          <div className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 flex-1">
            {parseInlineStyles(content)}
          </div>
        </div>
      );
      return;
    }

    // Numbered Lists (1. Item)
    if (/^\d+\.\s/.test(trimmed)) {
      const [num, ...rest] = trimmed.split(/\.\s/);
      const content = rest.join('. ');
      elements.push(
        <div key={key} className="flex gap-2 ml-1 mb-1.5 items-start">
          <span className="text-xs font-mono text-blue-500/80 dark:text-blue-400/80 mt-[2px] shrink-0">{num}.</span>
          <div className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 flex-1">
            {parseInlineStyles(content)}
          </div>
        </div>
      );
      return;
    }

    // Blockquotes (> Quote)
    if (trimmed.startsWith('> ')) {
      const content = trimmed.replace(/^>\s/, '');
      elements.push(
        <div key={key} className="pl-3 border-l-2 border-blue-500/30 italic text-slate-600 dark:text-slate-400 my-2 text-xs">
          {parseInlineStyles(content)}
        </div>
      );
      return;
    }

    // Normal Paragraphs
    elements.push(
      <div key={key} className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 mb-1">
        {parseInlineStyles(line)}
      </div>
    );
  });

  return <div className="space-y-0.5 select-text cursor-text">{elements}</div>;
};

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  isOpen,
  onClose,
  externalDragState,
  externalIncomingAsset,
  onExternalIncomingAssetHandled,
}) => {
  const [messages, setMessages] = useState<Message[]>([{ role: 'model', text: '你好！我是您的创意助手。今天想创作些什么？' }]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDropping, setIsDropping] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  // States for different modes
  const [isThinkingMode, setIsThinkingMode] = useState(false);
  const [isStoryboardActive, setIsStoryboardActive] = useState(false);
  const [isHelpMeWriteActive, setIsHelpMeWriteActive] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const dragDepthRef = useRef(0);

  // Auto-scroll
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages, isLoading, isOpen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If panel is open and click is outside the panel container
      if (isOpen && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleSendMessage = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading || isDropping) return;

    const userText = input.trim() || '请分析这些素材并给我可执行的创作建议。';
    const attachmentsToSend = [...attachments];
    setInput('');
    setAttachments([]);

    const newMessages: Message[] = [...messages, { role: 'user', text: userText }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      const model = isThinkingMode ? THINKING_CHAT_MODEL : DEFAULT_CHAT_MODEL;

      // Pass flags to the service
      const responseText = await sendChatMessage(history, userText, {
        isThinkingMode,
        isStoryboard: isStoryboardActive,
        isHelpMeWrite: isHelpMeWriteActive,
        model,
        attachments: attachmentsToSend
      });

      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'model', text: error.message || "连接错误，请稍后重试。" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([{ role: 'model', text: '你好！我是您的创意助手。今天想创作些什么？' }]);
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(err => console.error("Copy failed", err));
  };

  const normalizeAssetType = (rawType?: string): 'image' | 'video' | null => {
    if (!rawType) return null;
    if (rawType.includes('image')) return 'image';
    if (rawType.includes('video') || rawType.includes('mov')) return 'video';
    return null;
  };

  const addAttachment = (attachment: ChatAttachment) => {
    setAttachments(prev => {
      const exists = prev.some(item => item.url === attachment.url);
      if (exists) return prev;
      return [...prev, attachment].slice(0, 4);
    });
  };

  const uploadMediaFile = async (file: File): Promise<ChatAttachment> => {
    const isVideo = file.type.startsWith('video/');
    const result = await uploadToCos(file, {
      prefix: buildMediaPath(isVideo ? 'videos' : 'images')
    });
    return {
      id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: isVideo ? 'video' : 'image',
      url: result.url,
      name: file.name,
    };
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragDepthRef.current = 0;
    setIsDragActive(false);
    setIsDropping(true);
    try {
      const assetJson = e.dataTransfer.getData('application/json');
      const subjectJson = e.dataTransfer.getData('application/subject');

      if (assetJson) {
        const asset = JSON.parse(assetJson);
        const assetType = normalizeAssetType(asset?.type);
        if (assetType && asset?.src) {
          addAttachment({
            id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: assetType,
            url: asset.src,
            name: asset?.title || (assetType === 'image' ? '图片素材' : '视频素材')
          });
        }
      }

      if (subjectJson) {
        const subject = JSON.parse(subjectJson);
        const subjectImage =
          subject?.thumbnailUrl ||
          subject?.thumbnail ||
          subject?.images?.[0]?.url ||
          subject?.images?.[0]?.base64 ||
          null;
        if (subjectImage) {
          addAttachment({
            id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'image',
            url: subjectImage,
            name: subject?.name || '主体素材'
          });
        }
      }

      const files = Array.from(e.dataTransfer.files || []);
      const mediaFiles = files.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
      if (mediaFiles.length > 0) {
        const uploads = await Promise.all(mediaFiles.slice(0, 4).map(uploadMediaFile));
        uploads.forEach(addAttachment);
      }
    } catch (error) {
      console.warn('[AssistantPanel] Failed to process dropped assets:', error);
    } finally {
      setIsDropping(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0 && !isDropping) {
      setIsDragActive(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(item => item.id !== id));
  };

  useEffect(() => {
    if (!externalIncomingAsset) return;
    addAttachment({
      id: externalIncomingAsset.id || `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: externalIncomingAsset.type,
      url: externalIncomingAsset.url,
      name: externalIncomingAsset.name,
    });
    onExternalIncomingAssetHandled?.();
  }, [externalIncomingAsset, onExternalIncomingAssetHandled]);

  const SPRING_ANIMATION = "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]";
  const hasExternalDrag = Boolean(externalDragState?.active);
  const showDropReady = Boolean(externalDragState?.over);
  const showOverlay = isDragActive || isDropping || hasExternalDrag;

  return (
    <div
      ref={panelRef}
      data-chat-panel
      className={`fixed right-6 top-1/2 -translate-y-1/2 h-[85vh] w-[420px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl rounded-[24px] border border-slate-300 dark:border-slate-700 shadow-2xl z-40 flex flex-col overflow-hidden ${SPRING_ANIMATION} ${isOpen ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-10 scale-95 pointer-events-none'}`}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
          >
            <X size={14} className="group-hover:scale-110 transition-transform" />
          </button>
          <button
            onClick={handleClearChat}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 hover:text-red-400 transition-colors group"
            title="清空对话"
          >
            <Eraser size={14} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tracking-wide">AI 创意助手</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">提示词优化 & 灵感生成</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 flex items-center justify-center border border-slate-300 dark:border-slate-600 shadow-inner">
            <Sparkles size={14} className="text-blue-400" />
          </div>
        </div>
      </div>

      {/* Chat Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-800/50">
        {messages.map((m, i) => (
          <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex flex-col max-w-[92%] gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>

              {/* Role Label */}
              <div className="flex items-center gap-2 px-1">
                {m.role === 'model' && <span className="text-[10px] font-bold text-blue-500/80 dark:text-blue-400/80 uppercase tracking-wider">studio AI</span>}
                {m.role === 'user' && <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">You</span>}
              </div>

              {/* Message Bubble */}
              <div className="group relative transition-all w-full">
                <div
                  className={`
                            relative px-5 py-4 rounded-2xl shadow-sm border select-text cursor-text
                            ${m.role === 'user'
                      ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-tr-sm'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-tl-sm w-full pr-10' // Add padding right for copy button
                    }
                        `}
                >
                  {m.role === 'model' ? renderFormattedMessage(m.text) : <p className="leading-6 text-[13px] whitespace-pre-wrap">{m.text}</p>}

                  {/* Copy Button (Inside Bubble for reliability) */}
                  <button
                    onClick={() => handleCopy(m.text, i)}
                    className={`absolute top-2 right-2 p-1.5 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-white/80 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:scale-110 z-10`}
                    title="复制内容"
                  >
                    {copiedIndex === i ? <span className="text-[10px] font-bold text-green-400">OK</span> : <Copy size={10} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start w-full animate-in fade-in slide-in-from-bottom-2">
            <div className="flex flex-col gap-2 max-w-[85%]">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1 ${isThinkingMode ? 'text-indigo-400' : 'text-blue-500/80 dark:text-blue-400/80'}`}>
                {isThinkingMode ? 'Deep Thinking' : 'Thinking'}
              </span>
              <div className={`px-5 py-4 bg-white dark:bg-slate-800 border rounded-2xl rounded-tl-sm flex items-center gap-3 w-fit shadow-lg ${isThinkingMode ? 'border-indigo-500/30 shadow-indigo-900/20' : 'border-slate-200 dark:border-slate-700 shadow-cyan-900/10'}`}>
                <Loader2 size={16} className={`animate-spin ${isThinkingMode ? 'text-indigo-400' : 'text-blue-500'}`} />
                <span className={`text-xs font-medium tracking-wide ${isThinkingMode ? 'text-indigo-200' : 'text-slate-600 dark:text-slate-300'}`}>
                  {isThinkingMode ? "深度思考中..." : isStoryboardActive ? "正在规划分镜..." : isHelpMeWriteActive ? "正在润色文本..." : "正在思考创意..."}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shrink-0 flex flex-col gap-2">

        {/* Tool Bar */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIsThinkingMode(!isThinkingMode); setIsStoryboardActive(false); setIsHelpMeWriteActive(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${isThinkingMode ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              <Brain size={12} className={isThinkingMode ? "animate-pulse" : ""} />
              <span>深度思考模式</span>
            </button>

            <button
              onClick={() => { setIsStoryboardActive(!isStoryboardActive); setIsThinkingMode(false); setIsHelpMeWriteActive(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${isStoryboardActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              <PenLine size={12} />
              <span>分镜脚本</span>
            </button>

            <button
              onClick={() => { setIsHelpMeWriteActive(!isHelpMeWriteActive); setIsThinkingMode(false); setIsStoryboardActive(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${isHelpMeWriteActive ? 'bg-pink-500/20 text-pink-300 border-pink-500/50 shadow-[0_0_10px_rgba(236,72,153,0.2)]' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              <Wand2 size={12} />
              <span>帮我写</span>
            </button>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200"
              >
                {att.type === 'image' ? <ImageIcon size={11} /> : <Film size={11} />}
                <span className="max-w-[120px] truncate">{att.name || (att.type === 'image' ? '图片' : '视频')}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="text-slate-500 hover:text-red-500 transition-colors"
                  title="移除"
                >
                  <XCircle size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative group/input">
          <textarea
            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-[20px] pl-4 pr-12 py-3.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:bg-white/70 dark:focus:bg-slate-700 focus:border-blue-500/30 dark:focus:border-blue-500/50 transition-all resize-none custom-scrollbar leading-5"
            placeholder={
              isStoryboardActive ? "输入视频描述，我将为您生成专业分镜脚本..." :
                isThinkingMode ? "输入复杂问题，进行深度逻辑推理..." :
                  isHelpMeWriteActive ? "输入简短想法，我将帮您扩写和润色..." :
                    "输入您的想法，让 AI 为您完善..."
            }
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            rows={1}
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSendMessage}
            disabled={(!input.trim() && attachments.length === 0) || isLoading || isDropping}
            className={`absolute right-2 top-2 p-2 rounded-full transition-all duration-300 ${(input.trim() || attachments.length > 0) && !isLoading && !isDropping ? 'bg-blue-500 text-white hover:bg-cyan-400 hover:scale-105 shadow-lg shadow-cyan-500/20' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 cursor-not-allowed'}`}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <CornerDownLeft size={16} />}
          </button>
        </div>
        <div className="text-[9px] text-slate-600 dark:text-slate-400 text-center font-medium tracking-wide">
          Shift + Enter 换行
        </div>
      </div>

      {showOverlay && (
        <div className="absolute inset-0 z-[70] pointer-events-none rounded-[24px] border-2 border-cyan-400 bg-cyan-500/15 backdrop-blur-[1px] flex items-center justify-center">
          <div className="rounded-2xl border border-cyan-300/80 bg-white/90 dark:bg-slate-900/90 px-6 py-4 text-center shadow-2xl">
            <div className="flex items-center justify-center gap-2 text-cyan-600 dark:text-cyan-300 text-base font-bold">
              <Upload size={16} />
              {showDropReady ? '松开输入对话框' : '拖入对话'}
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {isDropping ? '正在添加素材到对话…' : (showDropReady ? '释放后将素材加入本轮对话' : '拖动到此处可将素材输入对话')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
