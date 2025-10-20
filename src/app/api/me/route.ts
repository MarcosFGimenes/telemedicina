import { NextRequest, NextResponse } from 'next/server';
import type { FirebaseFirestore } from 'firebase-admin';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { listAsaasPaymentsByCustomer, getAsaasSubscription, findAsaasCustomerByCpf } from '@/lib/asaasService';
import { getPlan } from '@/lib/plansStore';

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
  // Enriquecimento: derivar maxDependents a partir do plano (quando ausente)
  if (userDoc && (userDoc['maxDependents'] == null || userDoc['maxDependents'] === '')) {
    const pid = String(userDoc['planId'] || '').trim().toUpperCase();
    const st = String(userDoc['serviceType'] || '').trim().toUpperCase();
    const key = pid || st;
    if (key) {
      const plan = await getPlan(key).catch(() => null);
      if (plan && typeof plan.maxDependents === 'number') {
        (userDoc as Record<string, unknown>)['maxDependents'] = plan.maxDependents;
      }
    }
  }
  const cpf = (userDoc?.cpf as string | undefined) || null;
  const normalizedCpf = cpf ? cpf.replace(/\D/g, '') : null;
  const asaasCustomerId = (userDoc?.asaasCustomerId as string | undefined) || null;

  const paymentsMap = new Map<string, Record<string, unknown>>();
  const paymentsCollection = db.collection('payments');

  const appendPayments = (docs: FirebaseFirestore.QueryDocumentSnapshot[] | undefined | null) => {
    if (!docs?.length) return;
    docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const recordCustomerId = typeof data.customerId === 'string' ? data.customerId : null;
      const recordCpf = typeof data.cpf === 'string' ? data.cpf.replace(/\D/g, '') : null;

      if (asaasCustomerId && recordCustomerId && recordCustomerId !== asaasCustomerId) {
        return;
      }

      if (normalizedCpf && recordCpf && recordCpf !== normalizedCpf) {
        return;
      }

      paymentsMap.set(doc.id, { id: doc.id, source: 'firestore', ...data });
    });
  };

  // pagamentos vinculados ao customerId (prioritário)
  if (asaasCustomerId) {
    const byCustomer = await paymentsCollection
      .where('customerId', '==', asaasCustomerId)
      .limit(50)
      .get()
      .catch(() => null);
    appendPayments(byCustomer?.docs);
  }

  // fallback para CPF quando não há customerId nas faturas legadas
  if (cpf && paymentsMap.size < 50) {
    const byCpf = await paymentsCollection
      .where('cpf', '==', cpf)
      .limit(50)
      .get()
      .catch(() => null);
    appendPayments(byCpf?.docs);
  }

  // pagamentos sincronizados direto do Asaas
  {
    let effectiveCustomerId = asaasCustomerId;

    // Se não houver customerId armazenado, tenta obter via assinatura ou CPF
    if (!effectiveCustomerId) {
      const lastSubscriptionId = (userDoc?.lastSubscriptionId as string | undefined) || null;
      if (lastSubscriptionId) {
        try {
          const sub = await getAsaasSubscription(lastSubscriptionId);
          if (sub?.customer) {
            effectiveCustomerId = String(sub.customer);
          }
        } catch {
          // ignore
        }
      }
    }

    if (!effectiveCustomerId && normalizedCpf) {
      try {
        const customer = await findAsaasCustomerByCpf(normalizedCpf);
        if (customer?.id) {
          effectiveCustomerId = customer.id;
        }
      } catch {
        // ignore
      }
    }

    if (effectiveCustomerId) {
      const asaasPayments = await listAsaasPaymentsByCustomer(effectiveCustomerId).catch(() => []);
      asaasPayments.forEach((payment) => {
        if (payment.customer && payment.customer !== effectiveCustomerId) {
          return;
        }

        paymentsMap.set(payment.id, {
          id: payment.id,
          source: 'asaas',
          status: payment.status,
          value: payment.value,
          processedAt:
            (payment as any).updatedAt ||
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
        });
      });
    }
  }

  const payments = Array.from(paymentsMap.values());

  return NextResponse.json({ ok: true, user: userDoc, payments });
}
