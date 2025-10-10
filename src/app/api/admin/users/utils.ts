import type { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { ADMIN_ROLE } from '@/constants/roles';

export async function requireAdmin(req: NextRequest): Promise<DecodedIdToken> {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) {
    throw Object.assign(new Error('forbidden'), { statusCode: 401 });
  }

  const decoded = await adminAuth.verifyIdToken(token);
  const claims = decoded as DecodedIdToken & Record<string, unknown>;
  const claimRole =
    (typeof claims.role === 'string' && claims.role) ||
    (typeof claims['custom:role'] === 'string' && (claims['custom:role'] as string)) ||
    '';

  if (claimRole === ADMIN_ROLE) {
    return decoded;
  }

  const snap = await db.collection('users').where('authUid', '==', decoded.uid).limit(1).get();
  if (!snap.empty) {
    const data = snap.docs[0].data() as Record<string, unknown>;
    const docRole = typeof data.role === 'string' ? data.role : '';
    if (docRole === ADMIN_ROLE) {
      return decoded;
    }
  }

  throw Object.assign(new Error('forbidden'), { statusCode: 403 });
}
