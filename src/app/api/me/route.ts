import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { listAsaasPaymentsByCustomer } from '@/lib/asaasService';

async function getAuth(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const decoded = await getAuth(req);
  if (!decoded) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = decoded.uid;
  const email = decoded.email || null;

  // carrega user doc por authUid (preferido) ou por e-mail
  const users = db.collection('users');
  let snap = await users.where('authUid', '==', uid).limit(1).get();
  if (snap.empty && email) snap = await users.where('email', '==', email).limit(1).get();

  const userDoc = snap.empty ? null : { id: snap.docs[0].id, ...(snap.docs[0].data() as Record<string, unknown>) };
  // Enriquecimento: derivar planName a partir de serviceType quando ausente
  if (userDoc && !userDoc['planName']) {
    const st = String(userDoc['serviceType'] || '').toUpperCase();
    const derived =
      st === 'G'
        ? 'Generalista'
        : st === 'P'
        ? 'Psicologia'
        : st === 'GP'
        ? 'Generalista + Psicologia'
        : st === 'GS'
        ? 'Generalista + Especialistas'
        : st === 'GSP'
        ? 'Generalista + Especialistas + Psicologia'
        : '';
    if (derived) {
      (userDoc as Record<string, unknown>)['planName'] = derived;
    }
  }
  const cpf = (userDoc?.cpf as string | undefined) || null;
  const asaasCustomerId = (userDoc?.asaasCustomerId as string | undefined) || null;

  // pagamentos por CPF armazenados no Firestore (legado)
  let payments: Record<string, unknown>[] = [];
  if (cpf) {
    const pSnap = await db
      .collection('payments')
      .where('cpf', '==', cpf)
      .limit(50)
      .get()
      .catch(() => null);
    payments = pSnap?.docs?.map((d) => ({ id: d.id, source: 'firestore', ...(d.data() as Record<string, unknown>) })) || [];
  }

  // pagamentos sincronizados direto do Asaas
  if (asaasCustomerId) {
    const asaasPayments = await listAsaasPaymentsByCustomer(asaasCustomerId).catch(() => []);
    payments = [
      ...asaasPayments.map((payment) => ({
        id: payment.id,
        source: 'asaas',
        status: payment.status,
        value: payment.value,
        processedAt:
          payment.updatedAt ||
          payment.confirmedDate ||
          payment.paymentDate ||
          payment.creditDate ||
          payment.dateCreated ||
          payment.createdDate,
        dueDate: payment.dueDate,
        paymentDate: payment.paymentDate,
        billingType: payment.billingType,
        invoiceUrl: payment.invoiceUrl || payment.bankSlipUrl || payment.transactionReceiptUrl,
        raw: payment,
      })),
      ...payments,
    ];
  }

  return NextResponse.json({ ok: true, user: userDoc, payments });
}
