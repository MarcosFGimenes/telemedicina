import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/firebaseAdmin';
import { getAsaasCustomer } from '@/lib/asaasService';
import {
  buildBeneficiaryPayload,
  type BeneficiaryUserRecord,
} from '@/lib/beneficiaryPayload';
import { getPlan } from '@/lib/plansStore';
import {
  deactivateBeneficiary,
  ensureBeneficiaryByCPF,
  reactivateBeneficiary,
  type RapidocPlanItem,
} from '@/lib/rapidocService';

const THREE_DAYS_IN_MS = 3 * 24 * 60 * 60 * 1000;

const parseDate = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const SECRET = (process.env.ASAAS_WEBHOOK_SECRET || '').trim();

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
  const url = new URL(req.url);
  const providedToken =
    req.headers.get('asaas-access-token') ||
    req.headers.get('asaas_access_token') ||
    req.headers.get('access_token') ||
    req.headers.get('access-token') ||
    url.searchParams.get('access_token');

  if (SECRET && SECRET.length > 0) {
    if (!providedToken || providedToken.trim() !== SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const event = await req.json();
  const type = event?.event as string;
  const payment = event?.payment;
  const customerId: string | undefined = payment?.customer;
  const eventId: string | undefined = event?.id;
  const paymentId: string | undefined = payment?.id;

  if (!customerId) {
    return NextResponse.json({ ok: true, note: 'missing customer id' });
  }

  if (!TRACKED_EVENTS.has(type)) {
    return NextResponse.json({ ok: true, note: `event ${type} ignored` });
  }

  // Idempotency: ensure each Asaas event is processed once
  if (eventId) {
    try {
      await db
        .collection('webhookEvents')
        .doc(String(eventId))
        .create({
          provider: 'asaas',
          type,
          customerId,
          paymentId: payment?.id ?? null,
          receivedAt: new Date(),
        });
    } catch (err: any) {
      const code = String(err?.code || err?.details || err?.message || '');
      // Firestore may surface codes like 'already-exists' or status 6 (ALREADY_EXISTS)
      if (code.includes('already') || code.includes('ALREADY') || code.includes('6')) {
        return NextResponse.json({ ok: true, note: 'duplicate event ignored' });
      }
      console.error('[asaas/webhook] idempotency check failed', eventId, err);
    }
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

  try {
    const candidatePlanId = String((user as Record<string, unknown> | null)?.['planId'] || '').trim().toUpperCase();
    if (candidatePlanId) {
      const plan = await getPlan(candidatePlanId);
      const serviceType = plan?.serviceType || plan?.id || '';
      if (serviceType) {
        // Se tiver rapidocUuid, usar novo formato com plans
        if (plan?.rapidocUuid) {
          (basePayload as any).plans = [
            {
              paymentType: (basePayload.paymentType as 'S' | 'A') || 'S',
              plan: {
                uuid: plan.rapidocUuid,
              },
            },
          ];
          // Remove serviceType deprecated
          delete (basePayload as any).serviceType;
          delete (basePayload as any).paymentType;
        } else {
          // Fallback para formato antigo
          (basePayload as any).serviceType = serviceType;
        }
      }
    }
  } catch (err) {
    // best-effort only
  }

  const now = new Date();

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
        blockedReason: null,
        billingNotice: null,
        updatedAt: new Date(),
      });
    }
  } else if (DEACTIVATION_EVENTS.has(type)) {
    let shouldDeactivate = true;
    let blockedReason: string | null = null;
    let billingNotice: Record<string, unknown> | null = null;

    if (type === 'PAYMENT_OVERDUE') {
      blockedReason = 'overdue_payment';
      const dueDate = parseDate(payment?.dueDate);
      if (dueDate) {
        const graceLimit = new Date(dueDate.getTime() + THREE_DAYS_IN_MS);
        if (now.getTime() < graceLimit.getTime()) {
          shouldDeactivate = false;
        }
      }

      if (shouldDeactivate) {
        const message =
          'Identificamos um pagamento em atraso. Seu acesso às consultas permanecerá suspenso até que o pagamento seja confirmado pelo Asaas.';
        billingNotice = {
          reason: blockedReason,
          message,
          paymentId: paymentId ?? null,
          dueDate: payment?.dueDate ?? null,
          updatedAt: now,
          createdAt: now,
        };
      }
    }

    if (shouldDeactivate) {
      const updatePayload: Record<string, unknown> = { status: 'inactive', updatedAt: now };
      updatePayload.blockedReason = blockedReason;
      updatePayload.billingNotice = billingNotice;

      await userRef.update(updatePayload);

      if (user?.beneficiaryUuid) {
        try {
          await deactivateBeneficiary(String(user.beneficiaryUuid));
        } catch (error) {
          console.error('[asaas/webhook] deactivate failed', user?.beneficiaryUuid, error);
        }
      }
    }
  }

  // Registrar/atualizar documento de fatura (payments) deste pagamento
  try {
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
