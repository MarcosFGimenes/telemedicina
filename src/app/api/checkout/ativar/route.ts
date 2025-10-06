import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { beneficiaryId } = (await request.json()) as {
      beneficiaryId?: string;
    };

    if (!beneficiaryId || typeof beneficiaryId !== 'string') {
      return NextResponse.json(
        { error: 'beneficiaryId is required' },
        { status: 400 },
      );
    }

    const target = new URL(
      `/api/rapidoc/beneficiaries/${beneficiaryId}/reactivate`,
      request.nextUrl.origin,
    );

    const response = await fetch(target, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    const backend = await response
      .json()
      .catch(() => ({ message: 'No JSON body returned' }));

    if (!response.ok) {
      console.error('[checkout/ativar] Rapidoc error', response.status, backend);
      return NextResponse.json(
        { error: 'Failed to reactivate beneficiary', backend },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true, backend });
  } catch (error: unknown) {
    console.error('[checkout/ativar] Unexpected error', error);
    return NextResponse.json(
      {
        error: 'Unexpected error while reactivating beneficiary',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}