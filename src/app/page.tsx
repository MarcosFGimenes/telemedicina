import Link from 'next/link';

const features = [
  {
    title: 'Agendamentos em poucos cliques',
    description:
      'Seu assinante escolhe a especialidade, o beneficiário e confirma a consulta online sem depender do suporte.',
  },
  {
    title: 'Dependentes e beneficiários organizados',
    description:
      'Cadastro guiado com integração automática à Rapidoc e sincronização com o Firestore para vínculo imediato.',
  },
  {
    title: 'Cobrança e ativação automatizadas',
    description:
      'Acompanhe pagamentos Asaas, libere planos e gere faturas com visibilidade em tempo real.',
  },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid gap-10 rounded-3xl border border-white/70 bg-white/80 p-8 shadow-sm backdrop-blur lg:grid-cols-[1.3fr,1fr] lg:items-center lg:p-12">
        <div className="space-y-6">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            Fluxo digital ponta a ponta
          </span>
          <h1 className="text-4xl font-semibold text-zinc-900 sm:text-5xl">
            Telemedicina+ unifica experiência do assinante e gestão operacional.
          </h1>
          <p className="text-lg text-zinc-600">
            Simplifique o acesso à saúde digital oferecendo autonomia total ao beneficiário e ao time administrativo.
            A plataforma integra Rapidoc e Asaas desde o agendamento até a ativação do plano.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/assinante/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-700"
            >
              Acessar central do assinante
            </Link>
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center justify-center rounded-full border border-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Ver painel administrativo
            </Link>
          </div>
        </div>
        <div className="space-y-5 rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-emerald-100 p-6 shadow-inner">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Fluxo recomendado
          </p>
          <ol className="space-y-3 text-sm text-zinc-600">
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">1. Login simplificado</strong>
              <span className="block text-xs text-zinc-500">Convite via e-mail e autenticação Firebase.</span>
            </li>
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">2. Cadastro de dependentes</strong>
              <span className="block text-xs text-zinc-500">Integra Rapidoc + Firestore automaticamente.</span>
            </li>
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">3. Agendamento e cobrança</strong>
              <span className="block text-xs text-zinc-500">Consulta disponível e pagamento confirmado via Asaas.</span>
            </li>
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">4. Monitoramento contínuo</strong>
              <span className="block text-xs text-zinc-500">Painel administrativo controla status e acessos.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="flex h-full flex-col justify-between rounded-2xl border border-white/70 bg-white/80 p-6 shadow-sm">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-emerald-700">{feature.title}</h2>
              <p className="text-sm text-zinc-600">{feature.description}</p>
            </div>
            <span className="mt-6 inline-flex items-center text-xs font-semibold uppercase tracking-wide text-emerald-500">
              Pensado para autonomia total
            </span>
          </div>
        ))}
      </section>

      <section className="grid gap-6 rounded-3xl border border-white/60 bg-white/70 p-8 shadow-sm backdrop-blur lg:grid-cols-2 lg:p-12">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-zinc-900">Tudo que um assinante precisa em um só lugar</h2>
          <ul className="space-y-2 text-sm text-zinc-600">
            <li>• Histórico e status de pagamentos sincronizados com o Asaas.</li>
            <li>• Cadastro, vínculo e gestão de dependentes sem suporte manual.</li>
            <li>• Agendamento de consultas com confirmação imediata na Rapidoc.</li>
            <li>• Atualização de perfil, documentos e canais de atendimento.</li>
          </ul>
        </div>
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-zinc-900">Gestão administrativa de alto nível</h2>
          <ul className="space-y-2 text-sm text-zinc-600">
            <li>• Monitoramento de beneficiários ativos e inativos em tempo real.</li>
            <li>• Consulta aos agendamentos e encaminhamentos diretamente da Rapidoc.</li>
            <li>• Ferramentas de auditoria financeira e status de cobrança no Asaas.</li>
            <li>• Estrutura modular pronta para integrações adicionais.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
