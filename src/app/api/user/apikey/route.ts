import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('key_value, provider, status')
      .eq('assigned_user_id', userId)
      .eq('status', 'assigned')
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.key_value) {
      return NextResponse.json({ success: false, error: 'No assigned key' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      key: data.key_value,
      provider: data.provider,
      status: data.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
