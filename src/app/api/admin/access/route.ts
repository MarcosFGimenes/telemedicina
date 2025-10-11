import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../users/utils';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      typeof (error as { statusCode?: number })?.statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;

    if (status === 401 || status === 403) {
      return NextResponse.json({ error: 'forbidden' }, { status });
    }

    console.error('[admin][access][GET]', error);
    return NextResponse.json({ error: 'admin_check_failed' }, { status: 500 });
  }
}
