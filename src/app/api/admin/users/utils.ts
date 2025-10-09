import type { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '@/lib/firebaseAdmin';

export async function requireAdmin(req: NextRequest): Promise<DecodedIdToken> {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) {
    throw Object.assign(new Error('forbidden'), { statusCode: 401 });
  }

  const decoded = await adminAuth.verifyIdToken(token);
  const claims = decoded as DecodedIdToken & Record<string, unknown>;
  const hasAdminClaim =
    claims.admin === true ||
    claims.role === 'admin' ||
    claims['custom:role'] === 'admin' ||
    claims['x-admin'] === true;

  if (hasAdminClaim) {
    return decoded;
  }

  const snap = await db.collection('users').where('authUid', '==', decoded.uid).limit(1).get();
  if (!snap.empty) {
    const data = snap.docs[0].data() as Record<string, unknown>;
    if (data.role === 'admin' || data.isAdmin === true) {
      return decoded;
    }
  }

  throw Object.assign(new Error('forbidden'), { statusCode: 403 });
}
