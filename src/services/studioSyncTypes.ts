import type { AppNode, Canvas, Connection, Group, Subject, Workflow } from '@/types';
import type { TaskLog } from '@/types/taskLog';

export interface StudioSyncData {
  assets: any[];
  workflows: Workflow[];
  canvases: Canvas[];
  currentCanvasId: string | null;
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
  subjects: Subject[];
  nodeConfigs: Record<string, any>;
  taskLogs: TaskLog[];
  deletedItems?: Record<string, number>;
}

