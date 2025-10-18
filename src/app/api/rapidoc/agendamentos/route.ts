import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

const jsonError = (hint: string, status: number, message: string, upstream: unknown = null) =>
  NextResponse.json(
    {
      hint,
      upstreamStatus: status,
      message,
      upstream: typeof upstream === 'string' ? upstream : upstream ?? null,
    },
    { status },
  );

export async function GET() {
  try {
    const { data } = await rapidoc.get('/appointments');
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const upstreamStatus = error.response?.status ?? 500;
      const status = upstreamStatus === 200 ? 502 : upstreamStatus;
      const upstreamData = error.response?.data ?? null;
      const message =
        (typeof upstreamData === 'object' && upstreamData !== null &&
          typeof (upstreamData as Record<string, unknown>).message === 'string'
          ? (upstreamData as Record<string, unknown>).message
          : '') || error.message || 'Falha ao consultar agendamentos na Rapidoc.';

      return NextResponse.json(
        { hint: 'rapidoc-appointment-list', upstreamStatus, message, upstream: upstreamData },
        { status },
      );
    }

    const message = error instanceof Error ? error.message : 'Erro inesperado ao consultar agendamentos.';
    return jsonError('rapidoc-appointment-list', 500, message);
  }
}

type AppointmentPayload = {
  beneficiaryUuid: string;
  availabilityUuid: string;
  specialtyUuid: string;
  approveAdditionalPayment: boolean;
  beneficiaryMedicalReferralUuid?: string;
};

type IncomingReferralFields = Partial<Record<'referralUuid' | 'referralId', unknown>>;

export async function POST(req: NextRequest) {
  let incoming: Record<string, unknown>;

  try {
    incoming = await req.json();
  } catch {
    return jsonError('invalid_body', 400, 'Corpo da requisição inválido.');
  }

  const beneficiaryUuid = typeof incoming.beneficiaryUuid === 'string' ? incoming.beneficiaryUuid.trim() : '';
  const availabilityUuid =
    typeof incoming.slotId === 'string'
      ? incoming.slotId.trim()
      : typeof incoming.availabilityUuid === 'string'
      ? incoming.availabilityUuid.trim()
      : '';
  const specialtyUuid =
    typeof incoming.specialtyId === 'string'
      ? incoming.specialtyId.trim()
      : typeof incoming.specialtyUuid === 'string'
      ? incoming.specialtyUuid.trim()
      : '';

  if (!beneficiaryUuid || !availabilityUuid || !specialtyUuid) {
    return jsonError(
      'missing_fields',
      400,
      'Os campos beneficiaryUuid, availabilityUuid (ou slotId) e specialtyUuid são obrigatórios.',
    );
  }

  const payload: AppointmentPayload = {
    beneficiaryUuid,
    availabilityUuid,
    specialtyUuid,
    approveAdditionalPayment: true,
  };

  const incomingWithReferral = incoming as IncomingReferralFields;
  const referralUuidRaw =
    typeof incomingWithReferral.referralUuid === 'string'
      ? incomingWithReferral.referralUuid.trim()
      : '';
  const referralIdRaw =
    typeof incomingWithReferral.referralId === 'string' ? incomingWithReferral.referralId.trim() : '';
  const refUuid = referralUuidRaw || referralIdRaw;
  if (refUuid) {
    payload.beneficiaryMedicalReferralUuid = refUuid;
  }

  try {
    const { data } = await rapidoc.post('/appointments', payload, {
      headers: { 'Content-Type': 'application/vnd.rapidoc.tema-v2+json' },
    });
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const upstreamStatus = error.response?.status ?? 500;
      const status = upstreamStatus === 200 ? 502 : upstreamStatus;
      const upstreamData = error.response?.data ?? null;

      let message = error.message || 'Falha ao agendar na Rapidoc.';
      if (typeof upstreamData === 'object' && upstreamData !== null) {
        const container = upstreamData as Record<string, unknown>;
        if (typeof container.message === 'string' && container.message.trim()) {
          message = container.message;
        } else if (container.error && typeof container.error === 'object') {
          const nested = container.error as Record<string, unknown>;
          if (typeof nested.message === 'string' && nested.message.trim()) {
            message = nested.message;
          }
        }
      }

      return NextResponse.json(
        { hint: 'rapidoc-appointment-create', upstreamStatus, message, upstream: upstreamData },
        { status },
      );
    }

    const message = error instanceof Error ? error.message : 'Erro inesperado ao criar agendamento.';
    return jsonError('rapidoc-appointment-create', 500, message);
  }
}

