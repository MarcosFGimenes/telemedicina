import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { asaas } from '@/lib/asaas';
import type { CheckoutRequestBody } from '@/types/checkout';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutRequestBody;
    const cpfDigits = (body.cpf || '').replace(/\D/g, '');
    const value = Number(body.value || 0);

    if (!cpfDigits || !value) {
      return NextResponse.json({ error: 'cpf and value required' }, { status: 400 });
    }

    let customerId = body.customerId;

    if (!customerId) {
      const snapshot = await db.collection('users').where('cpf', '==', cpfDigits).limit(1).get();
      let userRef = snapshot.empty ? null : snapshot.docs[0].ref;
      let user = snapshot.empty ? null : snapshot.docs[0].data();

      if (!user) {
        if (!body.name) {
          return NextResponse.json({ error: 'name required to create customer' }, { status: 400 });
        }

        const { data: createdCustomer } = await asaas.post('/customers', {
          name: body.name,
          cpfCnpj: cpfDigits,
          email: body.email,
          mobilePhone: body.mobilePhone,
          postalCode: body.zipCode,
          address: body.address,
          city: body.city,
          state: body.state,
        });

        customerId = createdCustomer.id;

        const created = await db.collection('users').add({
          name: body.name,
          cpf: cpfDigits,
          email: body.email || null,
          phone: body.mobilePhone || null,
          zipCode: body.zipCode || null,
          address: body.address || null,
          city: body.city || null,
          state: body.state || null,
          asaasCustomerId: customerId,
          status: 'pending',
          beneficiaryUuid: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        userRef = created;
        user = (await created.get()).data();
      } else {
        customerId = user.asaasCustomerId;

        if (!customerId) {
          const { data: createdCustomer } = await asaas.post('/customers', {
            name: user.name,
            cpfCnpj: cpfDigits,
            email: user.email,
            mobilePhone: user.phone,
            postalCode: user.zipCode,
            address: user.address,
            city: user.city,
            state: user.state,
          });

          customerId = createdCustomer.id;
          await userRef!.update({ asaasCustomerId: customerId, updatedAt: new Date() });
        }
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: 'customerId not resolved' }, { status: 400 });
    }

    const dueDate = new Date().toISOString().slice(0, 10);

    const { data: payment } = await asaas.post('/payments', {
      customer: customerId,
      billingType: 'PIX',
      value,
      dueDate,
      description: body.description ?? 'Checkout PIX',
    });

    const { data: qr } = await asaas.get(`/payments/${payment.id}/pixQrCode`);

    return NextResponse.json({
      paymentId: payment.id,
      status: payment.status,
      invoiceUrl: payment.invoiceUrl ?? null,
      pix: {
        encodedImage: qr?.encodedImage,
        payload: qr?.payload,
        expirationDate: qr?.expirationDate,
      },
      customerId,
    });
  } catch (error: any) {
    const status = error?.response?.status || 500;
    const backend = error?.response?.data || null;
    console.error('[checkout/pagar-agora] error', status, backend || error?.message || error);
    return NextResponse.json({ error: backend || error?.message || 'unknown error' }, { status });
  }
}