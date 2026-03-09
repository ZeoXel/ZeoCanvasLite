import { AppNode, NodeType, NodeStatus, Connection } from '@/types';

// Minimal EventEmitter
type EventHandler = (payload: any) => void;

class SimpleEventEmitter {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, payload?: any) {
    this.listeners.get(event)?.forEach(h => h(payload));
  }
}

export type CanvasEvent =
  | 'node:created' | 'node:updated' | 'node:deleted'
  | 'node:status_changed'
  | 'connection:created' | 'connection:deleted';

export interface CanvasOperations {
  addNode: (node: AppNode) => void;
  updateNode: (id: string, updates: Partial<AppNode>) => void;
  updateNodeData: (id: string, data: Partial<AppNode['data']>, size?: { width?: number; height?: number }, title?: string) => void;
  updateNodeStatus: (id: string, status: NodeStatus, error?: string) => void;
  deleteNode: (id: string) => void;
  getNode: (id: string) => AppNode | undefined;
  getNodes: () => AppNode[];
  addConnection: (conn: Connection) => boolean;
  deleteConnection: (from: string, to: string) => void;
  getConnections: () => Connection[];
}

let nextAutoX = 100;
let nextAutoY = 100;

function autoPosition(): { x: number; y: number } {
  const pos = { x: nextAutoX, y: nextAutoY };
  nextAutoX += 280;
  if (nextAutoX > 1200) {
    nextAutoX = 100;
    nextAutoY += 300;
  }
  return pos;
}

class CanvasAPI extends SimpleEventEmitter {
  private ops: CanvasOperations | null = null;

  register(ops: CanvasOperations) {
    this.ops = ops;
  }

  unregister() {
    this.ops = null;
  }

  get registered(): boolean {
    return this.ops !== null;
  }

  createNode(
    type: NodeType,
    data?: Partial<AppNode['data']>,
    position?: { x: number; y: number },
    title?: string,
  ): AppNode {
    this.assertRegistered();
    const pos = position ?? autoPosition();
    const node: AppNode = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      x: pos.x,
      y: pos.y,
      title: title ?? type,
      status: NodeStatus.IDLE,
      data: data ?? {},
      inputs: [],
      modifiedAt: Date.now(),
    };
    this.ops!.addNode(node);
    this.emit('node:created', node);
    return node;
  }

  updateNode(id: string, data: Partial<AppNode['data']>, title?: string) {
    this.assertRegistered();
    this.ops!.updateNodeData(id, data, undefined, title);
    this.emit('node:updated', { id, data, title });
  }

  deleteNode(id: string) {
    this.assertRegistered();
    this.ops!.deleteNode(id);
    this.emit('node:deleted', { id });
  }

  setNodeStatus(id: string, status: NodeStatus, error?: string) {
    this.assertRegistered();
    this.ops!.updateNodeStatus(id, status, error);
    this.emit('node:status_changed', { id, status, error });
  }

  connect(fromId: string, toId: string): boolean {
    this.assertRegistered();
    const conn: Connection = {
      from: fromId,
      to: toId,
      id: `${fromId}->${toId}`,
      modifiedAt: Date.now(),
    };
    const ok = this.ops!.addConnection(conn);
    if (ok) this.emit('connection:created', conn);
    return ok;
  }

  disconnect(fromId: string, toId: string) {
    this.assertRegistered();
    this.ops!.deleteConnection(fromId, toId);
    this.emit('connection:deleted', { from: fromId, to: toId });
  }

  getNodes(filter?: { type?: NodeType; status?: NodeStatus }): AppNode[] {
    this.assertRegistered();
    let nodes = this.ops!.getNodes();
    if (filter?.type) nodes = nodes.filter(n => n.type === filter.type);
    if (filter?.status) nodes = nodes.filter(n => n.status === filter.status);
    return nodes;
  }

  getNode(id: string): AppNode | undefined {
    this.assertRegistered();
    return this.ops!.getNode(id);
  }

  getConnections(): Connection[] {
    this.assertRegistered();
    return this.ops!.getConnections();
  }

  private assertRegistered() {
    if (!this.ops) throw new Error('CanvasAPI: not registered');
  }
}

export const canvasAPI = new CanvasAPI();
