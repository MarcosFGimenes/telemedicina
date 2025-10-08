import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/firebaseAdmin';
import { getAsaasCustomer } from '@/lib/asaasService';
import {
  buildBeneficiaryPayload,
  type BeneficiaryUserRecord,
} from '@/lib/beneficiaryPayload';
import {
  deactivateBeneficiary,
  ensureBeneficiaryByCPF,
  reactivateBeneficiary,
} from '@/lib/rapidocService';

const SECRET = process.env.ASAAS_WEBHOOK_SECRET || '';

const ACTIVATION_EVENTS = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);
const DEACTIVATION_EVENTS = new Set([
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_CANCELLED',
]);
const TRACKED_EVENTS = new Set([
  ...ACTIVATION_EVENTS,
  ...DEACTIVATION_EVENTS,
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
]);

export async function POST(req: NextRequest) {
  const token = req.headers.get('asaas-access-token');
  if (!token || token !== SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const event = await req.json();
  const type = event?.event as string;
  const payment = event?.payment;
  const customerId: string | undefined = payment?.customer;

  if (!customerId) {
    return NextResponse.json({ ok: true, note: 'missing customer id' });
  }

  if (!TRACKED_EVENTS.has(type)) {
    return NextResponse.json({ ok: true, note: `event ${type} ignored` });
  }

  const snapshot = await db
    .collection('users')
    .where('asaasCustomerId', '==', customerId)
    .limit(1)
    .get();

  let userRef = snapshot.empty ? null : snapshot.docs[0].ref;
  let user = snapshot.empty ? null : (snapshot.docs[0].data() as BeneficiaryUserRecord | null);
  let asaasCustomer: Awaited<ReturnType<typeof getAsaasCustomer>> | null = null;

  if (!userRef) {
    const customer = await getAsaasCustomer(customerId);
    asaasCustomer = customer;

    if (!customer?.cpfCnpj) {
      await db.collection('events').add({
        kind: 'webhook_missing_cpf',
        customerId,
        at: new Date(),
        raw: event,
      });
      return NextResponse.json({ ok: true, note: 'missing cpf for rapidoc' });
    }

    const created = await db.collection('users').add({
      name: customer.name,
      cpf: customer.cpfCnpj.replace(/\D/g, ''),
      email: customer.email || null,
      phone: customer.mobilePhone || null,
      zipCode: customer.postalCode || null,
      address: customer.address || null,
      city: customer.city || customer.cityName || null,
      state: customer.state || null,
      asaasCustomerId: customer.id,
      status: 'pending',
      beneficiaryUuid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    userRef = created;
    user = (await created.get()).data() as BeneficiaryUserRecord | null;
  }

  if (!userRef || !user) {
    return NextResponse.json({ ok: true, note: 'user not resolved' });
  }

  const cpfDigits = String(user.cpf || '').replace(/\D/g, '');
  const basePayload = buildBeneficiaryPayload({
    cpf: cpfDigits,
    user,
    customer: asaasCustomer,
  });

  if (ACTIVATION_EVENTS.has(type)) {
    const ensured = await ensureBeneficiaryByCPF(basePayload);
    if (ensured?.uuid) {
      try {
        await reactivateBeneficiary(ensured.uuid);
      } catch (error) {
        console.error('[asaas/webhook] reactivate failed', ensured.uuid, error);
      }

      await userRef.update({
        status: 'active',
        beneficiaryUuid: ensured.uuid,
        updatedAt: new Date(),
      });
    }
  } else if (DEACTIVATION_EVENTS.has(type)) {
    await userRef.update({ status: 'inactive', updatedAt: new Date() });
    if (user?.beneficiaryUuid) {
      try {
        await deactivateBeneficiary(String(user.beneficiaryUuid));
      } catch (error) {
        console.error('[asaas/webhook] deactivate failed', user?.beneficiaryUuid, error);
      }
    }
  }

  // Registrar/atualizar documento de fatura (payments) deste pagamento
  try {
    const paymentId: string | undefined = payment?.id;
    if (paymentId) {
      const payRef = db.collection('payments').doc(paymentId);
      const payload: Record<string, unknown> = {
        updatedAt: new Date(),
        customerId,
        cpf: (user?.cpf as string | undefined) || null,
        status: payment?.status || type,
        value: payment?.value ?? null,
        billingType: payment?.billingType ?? null,
        invoiceUrl: payment?.invoiceUrl ?? null,
        dueDate: payment?.dueDate ?? null,
        paymentDate: payment?.paymentDate ?? null,
        confirmedDate: payment?.confirmedDate ?? null,
        transactionReceiptUrl: payment?.transactionReceiptUrl ?? null,
        bankSlipUrl: payment?.bankSlipUrl ?? null,
        createdDate: payment?.dateCreated ?? payment?.createdDate ?? null,
      };
      // Marca processed quando recebido/confirmado
      if (ACTIVATION_EVENTS.has(type)) {
        payload.processed = true;
        payload.processedAt = new Date();
      }
      await payRef.set(payload, { merge: true });
    }
  } catch (e) {
    console.error('[asaas/webhook] failed to write payment doc', payment?.id, e);
  }

  await db.collection('events').add({
    kind: 'asaas_webhook',
    type,
    customerId,
    userId: userRef.id,
    at: new Date(),
  });

  return NextResponse.json({ ok: true });
}
