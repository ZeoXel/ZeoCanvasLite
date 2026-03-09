"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { OpenClawClient, AgentMessage, AgentStatus, ChatAttachment } from '@/services/openClawClient';
import { canvasAPI } from '@/services/canvasAPI';
import { NodeType, NodeStatus } from '@/types';

interface OperationStep {
  op: string;
  params: Record<string, any>;
  status: 'pending' | 'done' | 'error';
  result?: any;
  error?: string;
}

interface ChatEntry {
  id: string;
  role: 'user' | 'agent';
  type: 'text' | 'operations';
  content?: string;
  operations?: OperationStep[];
  timestamp: number;
}

interface AssistantPanelProps {
  onClose: () => void;
  isVisible: boolean;
}

function executeCanvasOp(op: string, params: Record<string, any>): any {
  switch (op) {
    case 'node.create':
      return canvasAPI.createNode(
        params.type as NodeType,
        params.data,
        params.position,
        params.title,
      );
    case 'node.update':
      canvasAPI.updateNode(params.id, params.data, params.title);
      return { ok: true };
    case 'node.delete':
      canvasAPI.deleteNode(params.id);
      return { ok: true };
    case 'node.execute':
      canvasAPI.setNodeStatus(params.id, NodeStatus.WORKING);
      return { ok: true, note: 'status set to WORKING' };
    case 'connection.create':
      return { ok: canvasAPI.connect(params.from, params.to) };
    case 'connection.delete':
      canvasAPI.disconnect(params.from, params.to);
      return { ok: true };
    case 'canvas.query': {
      const nodes = canvasAPI.getNodes(params.filter);
      const connections = canvasAPI.getConnections();
      return { nodes: nodes.length, connections: connections.length, nodeList: nodes.map(n => ({ id: n.id, type: n.type, title: n.title, status: n.status })) };
    }
    default:
      return { error: `Unknown operation: ${op}` };
  }
}

export default function AssistantPanel({ onClose, isVisible }: AssistantPanelProps) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  const clientRef = useRef<OpenClawClient | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  useEffect(() => {
    const client = new OpenClawClient();
    clientRef.current = client;

    client.on('state_changed', setConnectionState);

    client.on('message', (msg: AgentMessage) => {
      if (msg.type === 'text' && msg.content) {
        setEntries(prev => [...prev, {
          id: `e-${Date.now()}`,
          role: 'agent',
          type: 'text',
          content: msg.content,
          timestamp: Date.now(),
        }]);
      }

      if (msg.type === 'canvas_operation' && msg.operation) {
        const step: OperationStep = {
          op: msg.operation.op,
          params: msg.operation.params,
          status: 'pending',
        };
        try {
          step.result = executeCanvasOp(msg.operation.op, msg.operation.params);
          step.status = 'done';
        } catch (err) {
          step.error = err instanceof Error ? err.message : String(err);
          step.status = 'error';
        }

        setEntries(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'agent' && last?.type === 'operations') {
            return [
              ...prev.slice(0, -1),
              { ...last, operations: [...(last.operations ?? []), step] },
            ];
          }
          return [...prev, {
            id: `e-${Date.now()}`,
            role: 'agent',
            type: 'operations',
            operations: [step],
            timestamp: Date.now(),
          }];
        });
      }

      if (msg.type === 'status' && msg.status) {
        setAgentStatus(msg.status);
      }
    });

    client.connect();
    return () => client.disconnect();
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !clientRef.current) return;

    setEntries(prev => [...prev, {
      id: `e-${Date.now()}`,
      role: 'user',
      type: 'text',
      content: text,
      timestamp: Date.now(),
    }]);

    const nodeCount = canvasAPI.registered ? canvasAPI.getNodes().length : 0;

    clientRef.current.send({
      type: 'user_message',
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      canvasContext: { nodeCount },
    });

    setInput('');
    setAttachments([]);
  }, [input, attachments]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const asset = JSON.parse(raw);
        if (asset.url && asset.type) {
          setAttachments(prev => prev.length < 4 ? [...prev, { type: asset.type, url: asset.url, name: asset.name }] : prev);
        }
      }
    } catch { /* ignore */ }
  }, []);

  if (!isVisible) return null;

  const statusDot = connectionState === 'connected' ? '🟢' : connectionState === 'connecting' ? '🟡' : '🔴';
  const statusText = connectionState === 'connected' ? '已连接' : connectionState === 'connecting' ? '连接中...' : '未连接';

  return (
    <div className="fixed right-0 top-0 h-full w-[360px] bg-gray-900 text-white flex flex-col z-20 shadow-2xl border-l border-gray-700">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">OpenClaw Terminal</span>
          <button
            onClick={() => connectionState === 'disconnected' ? clientRef.current?.reconnect() : undefined}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
            title={connectionState === 'disconnected' ? '点击重连' : statusText}
          >
            <span className="text-[10px]">{statusDot}</span>
            <span>{statusText}</span>
          </button>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">&times;</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {entries.map(entry => (
          <div key={entry.id}>
            {entry.type === 'text' && (
              <div className={`text-sm ${entry.role === 'user' ? 'text-blue-300' : 'text-gray-200'}`}>
                <span className="text-xs text-gray-500 mr-1">{entry.role === 'user' ? 'You' : 'Agent'}:</span>
                <div className="inline prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{entry.content ?? ''}</ReactMarkdown>
                </div>
              </div>
            )}
            {entry.type === 'operations' && entry.operations && (
              <div className="border border-gray-700 rounded-md p-2 text-xs font-mono bg-gray-800/50">
                <div className="text-gray-500 mb-1 text-[10px] uppercase tracking-wider">操作</div>
                {entry.operations.map((step, i) => (
                  <div key={i} className="flex items-start gap-1.5 py-0.5">
                    <span>{step.status === 'done' ? '✓' : step.status === 'error' ? '✗' : '●'}</span>
                    <span className={step.status === 'done' ? 'text-green-400' : step.status === 'error' ? 'text-red-400' : 'text-amber-400'}>
                      {step.op} {step.params.id ?? step.params.type ?? ''}
                    </span>
                    {step.error && <span className="text-red-500 text-[10px]"> {step.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {agentStatus === 'thinking' && (
          <div className="text-xs text-gray-500 animate-pulse">Agent 思考中...</div>
        )}
        {agentStatus === 'executing' && (
          <div className="text-xs text-amber-500 animate-pulse">Agent 执行中...</div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="px-4 py-1 flex gap-1 border-t border-gray-700">
          {attachments.map((a, i) => (
            <div key={i} className="bg-gray-800 rounded px-2 py-0.5 text-[10px] text-gray-400 flex items-center gap-1">
              {a.name ?? a.type}
              <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-gray-600 hover:text-white">&times;</button>
            </div>
          ))}
        </div>
      )}

      <div
        className="border-t border-gray-700 p-3 flex gap-2"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入指令..."
          rows={1}
          className="flex-1 bg-gray-800 text-sm text-white rounded-md px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || connectionState !== 'connected'}
          className="px-3 py-2 bg-blue-600 text-sm rounded-md hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          发送
        </button>
      </div>
    </div>
  );
}
