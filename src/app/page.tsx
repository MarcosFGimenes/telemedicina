import Link from 'next/link';

const features = [
  {
    title: 'Consultas confirmadas em minutos',
    description:
      'O assinante seleciona a especialidade, escolhe o melhor horário e recebe a confirmação automática direto no prontuário conectado.',
  },
  {
    title: 'Gestão completa da família',
    description:
      'Dependentes e beneficiários são adicionados em um fluxo guiado com sincronização imediata no Firestore.',
  },
  {
    title: 'Pagamentos claros e seguros',
    description:
      'Cobranças realizadas pelo Asaas com histórico acessível, recibos disponíveis e avisos de renovação para o assinante.',
  },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid gap-10 rounded-3xl border border-white/70 bg-white/80 p-8 shadow-sm backdrop-blur lg:grid-cols-[1.3fr,1fr] lg:items-center lg:p-12">
        <div className="space-y-6">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            Experiência pensada para o assinante
          </span>
          <h1 className="text-4xl font-semibold text-zinc-900 sm:text-5xl">
            Medicos Consultas Online coloca cada beneficiário no controle das suas consultas.
          </h1>
          <p className="text-lg text-zinc-600">
            Simplifique o cuidado digital oferecendo autonomia real para o assinante. A plataforma conecta agendamentos,
            pagamentos e prontidão do time médico em um ambiente único, integrando prontuário clínico e Asaas do convite à consulta.
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
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Como o assinante avança</p>
          <ol className="space-y-3 text-sm text-zinc-600">
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">1. Acesso instantâneo</strong>
              <span className="block text-xs text-zinc-500">Convite enviado por e-mail, autenticação rápida via Firebase e pronto para usar.</span>
            </li>
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">2. Cadastro da família</strong>
              <span className="block text-xs text-zinc-500">Integração automática com prontuário clínico e Firestore com orientações passo a passo.</span>
            </li>
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">3. Consulta garantida</strong>
              <span className="block text-xs text-zinc-500">Agenda disponível, pagamento confirmado pelo Asaas e lembretes automáticos.</span>
            </li>
            <li className="rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
              <strong className="text-emerald-700">4. Acompanhamento contínuo</strong>
              <span className="block text-xs text-zinc-500">Status da família sempre disponível e suporte acionável pelo time administrativo.</span>
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
              Autonomia total para o assinante
            </span>
          </div>
        ))}
      </section>

      <section className="grid gap-6 rounded-3xl border border-white/60 bg-white/70 p-8 shadow-sm backdrop-blur lg:grid-cols-2 lg:p-12">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-zinc-900">Tudo que o assinante encontra na plataforma</h2>
          <ul className="space-y-2 text-sm text-zinc-600">
            <li>• Linha do tempo de pagamentos com faturas e recibos disponíveis a qualquer momento.</li>
            <li>• Cadastro inteligente de dependentes, vínculos e permissões em um só fluxo.</li>
            <li>• Agendamentos rápidos com confirmação imediata no prontuário clínico e notificações por e-mail.</li>
            <li>• Área pessoal com atualização de perfil, documentos e canais de atendimento.</li>
          </ul>
        </div>
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-zinc-900">E o time administrativo acompanha tudo</h2>
          <ul className="space-y-2 text-sm text-zinc-600">
            <li>• Monitoramento de beneficiários ativos e inativos em tempo real.</li>
            <li>• Consulta aos agendamentos e encaminhamentos diretamente do prontuário digital.</li>
            <li>• Ferramentas de auditoria financeira com status e conciliação do Asaas.</li>
            <li>• Estrutura modular pronta para integrações adicionais e expansão de serviços.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
