import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';


const SECRET = process.env.ASAAS_WEBHOOK_SECRET!; // mesmo token configurado no painel Asaas


export async function POST(req: NextRequest) {
const token = req.headers.get('asaas-access-token');
if (!token || token !== SECRET) {
return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}


const event = await req.json();
const type = event?.event as string;
const payment = event?.payment;
const subId = payment?.subscription;
const customerId = payment?.customer;


// Descobrir usuário pelo customerId/subId armazenado localmente
const snap = await db.collection('users').where('asaasCustomerId', '==', customerId).limit(1).get();
if (snap.empty) return NextResponse.json({ ok: true });
const userRef = snap.docs[0].ref;


// Mapa de eventos → status do serviço
const activate = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
const deactivate = ['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED'];


if (activate.includes(type)) {
await userRef.update({ status: 'active', updatedAt: new Date() });
// opcional: chamar Rapidoc reativar beneficiário do titular e dependentes
// await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/rapidoc/beneficiaries/${beneficiaryUuid}/reactivate`, { method: 'PUT' })
}
if (deactivate.includes(type)) {
await userRef.update({ status: 'inactive', updatedAt: new Date() });
// opcional: chamar Rapidoc inativar
}


return NextResponse.json({ ok: true });
}