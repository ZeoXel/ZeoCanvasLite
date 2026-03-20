import { supabaseAdmin } from '@/lib/supabase';

export interface StudioSyncRecord {
  userId: string;
  data: Record<string, any>;
  version: number;
  clientUpdatedAt: number;
  updatedAt: string;
}

export class StudioSyncService {
  static async getUserData(userId: string): Promise<StudioSyncRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('studio_user_data')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if ((error as any).code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return {
      userId: data.user_id,
      data: data.data || {},
      version: data.version,
      clientUpdatedAt: data.client_updated_at || 0,
      updatedAt: data.updated_at,
    };
  }

  static async upsertUserData(params: {
    userId: string;
    data: Record<string, any>;
    clientUpdatedAt: number;
    baseVersion?: number;
  }): Promise<{ record: StudioSyncRecord; conflict: boolean }> {
    const { userId, data, clientUpdatedAt, baseVersion } = params;

    const existing = await this.getUserData(userId);
    if (existing) {
      if (baseVersion !== undefined && existing.version !== baseVersion) {
        return { record: existing, conflict: true };
      }
      if (existing.clientUpdatedAt > clientUpdatedAt) {
        return { record: existing, conflict: true };
      }
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    const nowIso = new Date().toISOString();

    const { data: saved, error } = await supabaseAdmin
      .from('studio_user_data')
      .upsert(
        {
          user_id: userId,
          data,
          version: nextVersion,
          client_updated_at: clientUpdatedAt,
          updated_at: nowIso,
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (error || !saved) {
      throw error || new Error('Failed to persist studio sync data');
    }

    return {
      record: {
        userId: saved.user_id,
        data: saved.data || {},
        version: saved.version,
        clientUpdatedAt: saved.client_updated_at || 0,
        updatedAt: saved.updated_at,
      },
      conflict: false,
    };
  }
}
