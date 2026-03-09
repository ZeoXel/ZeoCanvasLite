// --- Protocol types ---

export interface ChatAttachment {
  type: 'image' | 'video' | 'audio';
  url: string;
  name?: string;
}

export interface ClientMessage {
  type: 'user_message';
  content: string;
  attachments?: ChatAttachment[];
  canvasContext?: {
    nodeCount: number;
    selectedNodes?: string[];
  };
}

export interface CanvasOperation {
  op:
    | 'node.create' | 'node.update' | 'node.delete' | 'node.execute'
    | 'connection.create' | 'connection.delete'
    | 'canvas.query';
  params: Record<string, any>;
  result?: any;
}

export type AgentStatus = 'thinking' | 'executing' | 'idle' | 'error';

export interface AgentMessage {
  type: 'text' | 'canvas_operation' | 'status';
  content?: string;
  operation?: CanvasOperation;
  status?: AgentStatus;
  message?: string;
}

// --- Client ---

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type EventMap = {
  message: AgentMessage;
  connected: void;
  disconnected: void;
  error: Error;
  state_changed: ConnectionState;
};
type Handler<T> = (payload: T) => void;

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private queue: ClientMessage[] = [];
  private listeners = new Map<string, Set<Handler<any>>>();
  private url: string;
  private disposed = false;

  constructor(url = 'ws://localhost:9527') {
    this.url = url;
  }

  get state(): ConnectionState { return this._state; }

  connect() {
    if (this.disposed) return;
    if (this._state !== 'disconnected') return;
    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.setState('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.emit('connected', undefined as any);
      this.startHeartbeat();
      this.flushQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as AgentMessage;
        this.emit('message', msg);
      } catch {
        // ignore malformed
      }
    };

    this.ws.onclose = () => {
      this.cleanup();
      this.setState('disconnected');
      this.emit('disconnected', undefined as any);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.emit('error', new Error('WebSocket error'));
    };
  }

  disconnect() {
    this.disposed = true;
    this.clearReconnect();
    this.cleanup();
    this.setState('disconnected');
  }

  send(message: ClientMessage) {
    if (this._state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.queue.push(message);
    }
  }

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>) {
    this.listeners.get(event)?.delete(handler);
  }

  reconnect() {
    this.disposed = false;
    this.reconnectAttempts = 0;
    this.clearReconnect();
    this.cleanup();
    this.setState('disconnected');
    this.connect();
  }

  private setState(s: ConnectionState) {
    if (this._state === s) return;
    this._state = s;
    this.emit('state_changed', s);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    this.listeners.get(event)?.forEach(h => h(payload));
  }

  private flushQueue() {
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      this.ws?.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanup() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    this.clearReconnect();
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
