'use client';

import {
  ConfirmationResult,
  RecaptchaVerifier,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPhoneNumber,
  UserCredential,
} from 'firebase/auth';
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth as getAuth, buildRecaptcha } from '@/lib/firebaseClient';
import {
  formatCpf,
  formatPhone,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  onlyDigits,
} from '@/utils/format';

const EMAIL_KEY = 'telemed-login-email';
const CPF_KEY = 'telemed-login-cpf';

function LoginContent() {
  const [cpf, setCpf] = useState('');
  const [cpfValidated, setCpfValidated] = useState(false);
  const [lookup, setLookup] = useState<{ exists: boolean; email?: string | null; phone?: string | null; name?: string | null } | null>(null);
  const [method, setMethod] = useState<'email' | 'sms' | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [code, setCode] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const router = useRouter();
  const params = useSearchParams();

  const readError = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  const nextUrl = params.get('next') || '/assinante/dashboard';
  const prefilledCpf = useMemo(() => params.get('cpf') || '', [params]);

  useEffect(() => {
    if (prefilledCpf) {
      setCpf(formatCpf(prefilledCpf));
      setCpfValidated(isValidCpf(prefilledCpf));
    }
  }, [prefilledCpf]);

  const resetFlow = useCallback(() => {
    setMethod(null);
    setError('');
    setStatus('');
    setConfirmation(null);
    setCode('');
    setLoading(false);
  }, []);

  const finalizeLogin = useCallback(
    async (credential: UserCredential, cpfValue: string, contact?: { email?: string; phone?: string }) => {
      try {
        setFinalizing(true);
        const digits = onlyDigits(cpfValue || cpf || window.localStorage.getItem(CPF_KEY) || '');
        const token = await credential.user.getIdToken();
        await fetch('/api/auth/cpf/link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cpf: digits,
            email: contact?.email || email,
            phone: contact?.phone || phone,
            name,
          }),
        });
        await fetch('/api/auth/link', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => undefined);
        await linkBeneficiaryIfPresent(token);
        router.replace(nextUrl);
      } catch (err) {
        console.error('[login][finalize]', err);
        setError(readError(err, 'Não foi possível finalizar o login.'));
      } finally {
        setFinalizing(false);
      }
    },
    [cpf, email, name, nextUrl, phone, router],
  );

  useEffect(() => {
    const auth = getAuth();
    if (typeof window === 'undefined') return;
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const storedEmail = window.localStorage.getItem(EMAIL_KEY) || '';
    const storedCpf = window.localStorage.getItem(CPF_KEY) || '';

    const complete = async () => {
      try {
        const confirmation = storedEmail || (typeof window !== 'undefined' ? window.prompt('Confirme seu e-mail cadastrado para concluir o acesso:') : '');
        const finalEmail = confirmation || '';
        if (!finalEmail) {
          setError('Informe o e-mail utilizado para solicitar o acesso.');
          return;
        }
        const credential = await signInWithEmailLink(auth, finalEmail, window.location.href);
        setEmail(finalEmail);
        await finalizeLogin(credential, storedCpf || cpf || params.get('cpf') || '', {
          email: finalEmail,
        });
      } catch (err) {
        console.error('[login][emailLink]', err);
        setError(readError(err, 'Não foi possível concluir o acesso. Tente reenviar o link.'));
      } finally {
        window.localStorage.removeItem(EMAIL_KEY);
        window.localStorage.removeItem(CPF_KEY);
      }
    };

    complete();
  }, [cpf, finalizeLogin, params]);

  const lookupCpf = useCallback(
    async (value: string) => {
      const digits = onlyDigits(value);
      if (!isValidCpf(digits)) {
        setError('Informe um CPF válido com 11 dígitos.');
        return false;
      }
      setLoading(true);
      setError('');
      setStatus('');
      try {
        const res = await fetch(`/api/auth/cpf?cpf=${digits}`);
        if (!res.ok) {
          throw new Error('Falha ao consultar dados do CPF');
        }
        const data = await res.json();
        setLookup(data);
        if (data?.email) setEmail(data.email);
        if (data?.phone) setPhone(data.phone);
        if (data?.name) setName(data.name);
        setCpfValidated(true);
        return true;
      } catch (err) {
        console.error('[login][lookup]', err);
        setError(readError(err, 'Não foi possível verificar o CPF.'));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onCpfSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    resetFlow();
    const success = await lookupCpf(cpf);
    if (success) {
      setStatus('Escolha como deseja receber o acesso.');
    }
  };

  const ensureProfile = useCallback(
    async (payload: { cpf: string; email?: string; phone?: string; name?: string }) => {
      await fetch('/api/auth/cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    [],
  );

  const handleSendEmail = async () => {
    const digits = onlyDigits(cpf);
    if (!isValidCpf(digits)) {
      setError('CPF inválido.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Informe um e-mail válido.');
      return;
    }
    setLoading(true);
    setError('');
    setStatus('Enviando link de acesso por e-mail…');
    try {
      await ensureProfile({ cpf: digits, email, name });
      const auth = getAuth();
      const url = new URL('/login', window.location.origin);
      url.searchParams.set('next', nextUrl);
      url.searchParams.set('cpf', digits);
      await sendSignInLinkToEmail(auth, email, {
        url: url.toString(),
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_KEY, email);
      window.localStorage.setItem(CPF_KEY, digits);
      setMethod('email');
      setStatus('Enviamos um link de acesso para o e-mail informado. Abra o link no mesmo dispositivo ou informe o e-mail novamente para finalizar.');
    } catch (err) {
      console.error('[login][email]', err);
      setError(readError(err, 'Não foi possível enviar o link de acesso.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendSms = async () => {
    const digits = onlyDigits(cpf);
    if (!isValidCpf(digits)) {
      setError('CPF inválido.');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('Informe um telefone celular válido com DDD.');
      return;
    }
    setLoading(true);
    setError('');
    setStatus('Enviando código por SMS…');
    try {
      await ensureProfile({ cpf: digits, phone, name });
      if (!recaptchaRef.current) {
        recaptchaRef.current = buildRecaptcha('recaptcha-container');
      }
      const appAuth = getAuth();
      const confirmationResult = await signInWithPhoneNumber(appAuth, `+55${onlyDigits(phone)}`, recaptchaRef.current);
      setConfirmation(confirmationResult);
      setMethod('sms');
      setStatus('Enviamos um código por SMS. Digite-o abaixo para concluir seu acesso.');
    } catch (err) {
      console.error('[login][sms]', err);
      setError(readError(err, 'Não foi possível enviar o SMS.'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCode = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!confirmation) return;
    if (!code) {
      setError('Informe o código recebido por SMS.');
      return;
    }
    try {
      setLoading(true);
      const credential = await confirmation.confirm(code);
      await finalizeLogin(credential, onlyDigits(cpf), { phone });
    } catch (err) {
      console.error('[login][confirm]', err);
      setError(readError(err, 'Código inválido. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const disableActions = loading || finalizing;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-emerald-700">Acesse com seu CPF</h1>
        <p className="text-sm text-zinc-600">Receba um link por e-mail ou um código por SMS sem precisar lembrar de senha.</p>
      </div>

      <form onSubmit={onCpfSubmit} className="card space-y-4 border-emerald-100 p-6">
        <div>
          <label className="label">CPF</label>
          <input
            value={cpf}
            onChange={(event) => {
              setCpf(formatCpf(event.target.value));
              setCpfValidated(false);
              setLookup(null);
              resetFlow();
            }}
            onBlur={() => {
              if (isValidCpf(cpf)) {
                lookupCpf(cpf);
              }
            }}
            className="input"
            placeholder="000.000.000-00"
            inputMode="numeric"
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label className="label">Nome completo (opcional)</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input"
            placeholder="Como devemos te chamar?"
            autoComplete="name"
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={disableActions}>
          {cpfValidated ? 'Atualizar dados' : 'Continuar'}
        </button>
      </form>

      {lookup && (
        <div className="mt-6 space-y-4 rounded-2xl border border-emerald-100 bg-white/70 p-6 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Como deseja receber o acesso?</p>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
              />
              <button
                type="button"
                onClick={handleSendEmail}
                className="btn-outline w-full"
                disabled={disableActions}
              >
                Receber link por e-mail
              </button>
            </div>
            <div className="space-y-2">
              <label className="label">Telefone celular</label>
              <input
                className="input"
                value={phone}
                onChange={(event) => setPhone(formatPhone(event.target.value))}
                placeholder="(11) 99999-0000"
                inputMode="tel"
                autoComplete="tel"
              />
              <button type="button" onClick={handleSendSms} className="btn-outline w-full" disabled={disableActions}>
                Receber código por SMS
              </button>
            </div>
          </div>
        </div>
      )}

      {method === 'sms' && confirmation && (
        <form onSubmit={handleConfirmCode} className="mt-6 space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-6 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Digite o código recebido</p>
          <input
            className="input"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={disableActions}>
            Concluir acesso
          </button>
        </form>
      )}

      {(method === 'email' || status) && (
        <div className="mt-6 rounded-2xl border border-emerald-100 bg-white/70 p-5 text-sm text-emerald-700 shadow-sm">
          {status || 'Verifique sua caixa de entrada para finalizar o acesso.'}
        </div>
      )}

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      <div id="recaptcha-container" />
    </div>
  );
}

async function linkBeneficiaryIfPresent(token: string) {
  try {
    const params = new URLSearchParams(window.location.search);
    const uuid = params.get('uuid') || params.get('beneficiaryUuid') || '';
    if (!uuid) return;
    await fetch('/api/me/beneficiary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uuid }),
    });
  } catch (err) {
    console.warn('[login][beneficiary]', err);
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-zinc-500">Carregando formulário…</div>}>
      <LoginContent />
    </Suspense>
  );
}
