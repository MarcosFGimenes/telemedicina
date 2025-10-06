import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { getAsaasCustomer } from '@/lib/asaasService';
import {
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

  const snapshot = await db
    .collection('users')
    .where('asaasCustomerId', '==', customerId)
    .limit(1)
    .get();

  let userRef = snapshot.empty ? null : snapshot.docs[0].ref;
  let user = snapshot.empty ? null : snapshot.docs[0].data();

  if (!userRef) {
    const customer = await getAsaasCustomer(customerId);
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
    user = (await created.get()).data();
  }

  if (!userRef || !user) {
    return NextResponse.json({ ok: true, note: 'user not resolved' });
  }

  const cpfDigits = String(user.cpf || '').replace(/\D/g, '');
  const basePayload = {
    name: user.name,
    cpf: cpfDigits,
    email: user.email || undefined,
    phone: user.phone || undefined,
    zipCode: user.zipCode || undefined,
    address: user.address || undefined,
    city: user.city || undefined,
    state: user.state || undefined,
    birthday: user.birthday || undefined,
  };

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