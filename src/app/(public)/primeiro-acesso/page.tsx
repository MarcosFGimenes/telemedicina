'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth as getAuth } from '@/lib/firebaseClient';
import { formatCpf, isValidCpf, isValidEmail, isValidPassword } from '@/utils/format';
import type { BeneficiaryRecord } from '@/utils/beneficiary';

const SUPPORT_URL = 'mailto:suporte@telemedicina.plus';

type Step = 'cpf' | 'confirm';

type BeneficiaryResponse = {
  beneficiary: BeneficiaryRecord;
};

type ApiError = 'invalid_cpf' | 'not_found' | 'missing_uuid' | 'lookup_failed';

const readFirebaseError = (error: unknown) => {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'Este e-mail já está em uso. Utilize outro endereço ou recupere a senha.';
      case 'auth/invalid-email':
        return 'Informe um e-mail válido para continuar.';
      case 'auth/weak-password':
        return 'A senha informada é muito fraca. Utilize pelo menos 6 caracteres.';
      default:
        break;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Não foi possível concluir seu cadastro. Tente novamente.';
};

export default function FirstAccessPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('cpf');
  const [cpf, setCpf] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [loadingCpf, setLoadingCpf] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [beneficiary, setBeneficiary] = useState<BeneficiaryRecord | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCpfSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLookupError('');

    const sanitized = cpf.replace(/\D/g, '');
    if (!isValidCpf(sanitized)) {
      setCpfError('Informe um CPF válido com 11 dígitos.');
      return;
    }

    setCpfError('');
    setLoadingCpf(true);

    try {
      const response = await fetch('/api/primeiro-acesso/beneficiario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: sanitized }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: ApiError };
        if (data.error === 'not_found') {
          setLookupError(
            'Beneficiário não encontrado. Por favor, cadastre-se ou entre em contato com o atendimento.',
          );
        } else if (data.error === 'invalid_cpf') {
          setLookupError('CPF inválido. Verifique os números informados.');
        } else {
          setLookupError('Não foi possível localizar o beneficiário. Tente novamente.');
        }
        return;
      }

      const data = (await response.json()) as BeneficiaryResponse;
      setBeneficiary(data.beneficiary);
      setEmail(data.beneficiary.email ?? '');
      setStep('confirm');
    } catch (error) {
      console.error('[primeiro-acesso][lookup]', error);
      setLookupError('Falha ao consultar a Rapidoc. Tente novamente em instantes.');
    } finally {
      setLoadingCpf(false);
    }
  };

  const cpfFormatted = useMemo(() => formatCpf(cpf), [cpf]);

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!beneficiary) return;

    if (!isValidEmail(email)) {
      setFormError('Informe um e-mail válido.');
      return;
    }

    if (!isValidPassword(password)) {
      setFormError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('A confirmação de senha não confere.');
      return;
    }

    setFormError('');
    setSubmitting(true);

    try {
      const auth = getAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const token = await credential.user.getIdToken();

      try {
        await fetch('/api/auth/link', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        console.warn('[primeiro-acesso][link]', error);
      }

      try {
        await fetch('/api/me/beneficiary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uuid: beneficiary.uuid,
            overwrite: true,
            profile: {
              cpf: beneficiary.cpf,
              name: beneficiary.name,
              birthday: beneficiary.birthday,
              phone: beneficiary.phone,
              email,
            },
          }),
        });
      } catch (error) {
        console.warn('[primeiro-acesso][link-beneficiary]', error);
      }

      router.replace('/assinante/dashboard');
    } catch (error) {
      console.error('[primeiro-acesso][create-account]', error);
      setFormError(readFirebaseError(error));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-emerald-700">Primeiro acesso</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Valide seu CPF, confirme os dados do beneficiário e escolha um e-mail e senha para acessar a plataforma.
        </p>
      </div>

      {step === 'cpf' && (
        <form onSubmit={handleCpfSubmit} className="card space-y-4 border-emerald-100 p-6">
          <div>
            <label className="label" htmlFor="cpf">
              CPF do beneficiário
            </label>
            <input
              id="cpf"
              name="cpf"
              type="text"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              value={cpfFormatted}
              onChange={(event) => setCpf(event.target.value)}
              placeholder="000.000.000-00"
              maxLength={14}
              required
            />
            {cpfError && <p className="mt-2 text-sm text-red-600">{cpfError}</p>}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loadingCpf}>
            {loadingCpf ? 'Consultando…' : 'Continuar'}
          </button>

          {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}

          <p className="text-xs text-zinc-500">
            Em caso de dúvidas, fale com o suporte em{' '}
            <Link href={SUPPORT_URL} className="font-medium text-emerald-700 hover:underline">
              suporte@telemedicina.plus
            </Link>
            .
          </p>
        </form>
      )}

      {step === 'confirm' && beneficiary && (
        <form onSubmit={handleCreateAccount} className="card space-y-6 border-emerald-100 p-6">
          <div className="space-y-3">
            <p className="text-sm text-emerald-700">
              Encontramos o beneficiário na Rapidoc. Confira os dados abaixo antes de criar sua conta.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Nome completo</label>
                <input className="input bg-zinc-50" value={beneficiary.name} readOnly />
              </div>
              <div>
                <label className="label">CPF</label>
                <input className="input bg-zinc-50" value={formatCpf(beneficiary.cpf)} readOnly />
              </div>
              {beneficiary.birthday && (
                <div>
                  <label className="label">Data de nascimento</label>
                  <input className="input bg-zinc-50" value={beneficiary.birthday} readOnly />
                </div>
              )}
              {beneficiary.phone && (
                <div>
                  <label className="label">Telefone</label>
                  <input className="input bg-zinc-50" value={beneficiary.phone} readOnly />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label" htmlFor="email">
                Escolha o e-mail de acesso
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Crie uma senha
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="confirmPassword">
                Confirme a senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setStep('cpf');
                setSubmitting(false);
              }}
            >
              Voltar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Criando acesso…' : 'Criar conta'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
