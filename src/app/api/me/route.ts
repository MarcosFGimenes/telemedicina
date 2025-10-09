import { NextRequest, NextResponse } from 'next/server';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { listAsaasPaymentsByCustomer } from '@/lib/asaasService';
import { derivePlanMetadata } from '@/lib/planMetadata';
import { fetchBeneficiaryByCpf } from '@/lib/rapidocSync';
import { sanitizeCPF } from '@/lib/rapidocService';

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

  let docRef: DocumentReference | null = null;
  let docData: Record<string, unknown> | null = null;
  if (!snap.empty) {
    docRef = snap.docs[0].ref;
    docData = snap.docs[0].data() as Record<string, unknown>;
  }

  const userDoc = docData ? { id: snap.docs[0].id, ...docData } : null;

  if (docRef && docData) {
    const cpf = sanitizeCPF(String(docData.cpf || ''));
    const hasServiceType = typeof docData.serviceType === 'string' && docData.serviceType.trim().length > 0;
    const hasPaymentType = typeof docData.paymentType === 'string' && docData.paymentType.trim().length > 0;
    const hasUuid = typeof docData.beneficiaryUuid === 'string' && docData.beneficiaryUuid.trim().length > 0;

    if (cpf && (!hasServiceType || !hasPaymentType || !hasUuid)) {
      try {
        const beneficiary = await fetchBeneficiaryByCpf(cpf);
        const updates: Record<string, unknown> = {};
        const now = new Date();

        if (!hasUuid) updates.beneficiaryUuid = beneficiary.uuid;
        if (!hasServiceType || String(docData.serviceType).toUpperCase() !== beneficiary.serviceType) {
          updates.serviceType = beneficiary.serviceType;
        }
        if (!hasPaymentType || String(docData.paymentType).toUpperCase() !== beneficiary.paymentType) {
          updates.paymentType = beneficiary.paymentType;
        }
        if (!docData.name && beneficiary.name) updates.name = beneficiary.name;
        if (!docData.birthday && beneficiary.birthday) updates.birthday = beneficiary.birthday;
        if (!docData.rapidocSnapshot) updates.rapidocSnapshot = beneficiary.raw;

        const changed = Object.keys(updates).length > 0;
        if (changed) {
          updates.updatedAt = now;
          await docRef.set(updates, { merge: true });
          Object.assign(docData, updates);
          if (userDoc) Object.assign(userDoc, updates);
        }
      } catch (error) {
        console.warn('[me] Não foi possível sincronizar dados da Rapidoc', error);
      }
    }

    if (userDoc) {
      const metadata = await derivePlanMetadata(String(userDoc['serviceType'] || ''));
      const updates: Record<string, unknown> = {};

      if (metadata.planName && userDoc['planName'] !== metadata.planName) {
        userDoc['planName'] = metadata.planName;
        updates.planName = metadata.planName;
      }
      if (metadata.planDescription && userDoc['planDescription'] !== metadata.planDescription) {
        userDoc['planDescription'] = metadata.planDescription;
        updates.planDescription = metadata.planDescription;
      }
      if (metadata.maxDependents !== undefined && userDoc['maxDependents'] !== metadata.maxDependents) {
        userDoc['maxDependents'] = metadata.maxDependents;
        updates.maxDependents = metadata.maxDependents;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await docRef.set(updates, { merge: true });
        Object.assign(docData, updates);
      }
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
