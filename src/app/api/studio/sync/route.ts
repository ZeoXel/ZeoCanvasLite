import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { StudioSyncService } from '@/lib/services/studioSync.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const record = await StudioSyncService.getUserData(userId);
    if (!record) {
      return NextResponse.json({ record: null }, { status: 404 });
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error('[Studio Sync] GET error:', error);
    return NextResponse.json({ error: 'Failed to load sync data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = body?.data;
    const clientUpdatedAt = Number(body?.clientUpdatedAt || 0);
    const baseVersion = body?.baseVersion !== undefined ? Number(body.baseVersion) : undefined;

    if (!data || !Number.isFinite(clientUpdatedAt)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const result = await StudioSyncService.upsertUserData({
      userId,
      data,
      clientUpdatedAt,
      baseVersion,
    });

    if (result.conflict) {
      return NextResponse.json({ record: result.record }, { status: 409 });
    }

    return NextResponse.json({ record: result.record });
  } catch (error) {
    console.error('[Studio Sync] POST error:', error);
    return NextResponse.json({ error: 'Failed to save sync data' }, { status: 500 });
  }
}
