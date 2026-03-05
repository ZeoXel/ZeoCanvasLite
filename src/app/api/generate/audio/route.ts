import { NextRequest, NextResponse } from 'next/server';
import { POST as minimaxPOST, GET as minimaxGET } from '@/app/api/audio/minimax/route';
import { POST as sunoPOST, GET as sunoGET } from '@/app/api/audio/suno/route';

type AudioProvider = 'minimax' | 'suno';

const getProvider = async (request: NextRequest): Promise<AudioProvider | null> => {
  const searchProvider = new URL(request.url).searchParams.get('provider');
  if (searchProvider === 'minimax' || searchProvider === 'suno') {
    return searchProvider;
  }

  try {
    const body = await request.clone().json();
    const bodyProvider = body?.provider;
    if (bodyProvider === 'minimax' || bodyProvider === 'suno') {
      return bodyProvider;
    }
  } catch {
    // Ignore JSON parse failures here. We only need provider hint.
  }

  return null;
};

export async function POST(request: NextRequest) {
  const provider = await getProvider(request);
  if (!provider) {
    return NextResponse.json(
      { error: 'provider is required and must be one of: minimax, suno' },
      { status: 400 }
    );
  }

  return provider === 'minimax' ? minimaxPOST(request) : sunoPOST(request);
}

export async function GET(request: NextRequest) {
  const provider = await getProvider(request);
  if (!provider) {
    return NextResponse.json(
      { error: 'provider is required and must be one of: minimax, suno' },
      { status: 400 }
    );
  }

  return provider === 'minimax' ? minimaxGET(request) : sunoGET(request);
}
