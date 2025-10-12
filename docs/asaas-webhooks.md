Asaas Webhooks – Integração em Sandbox

Visão geral
- O endpoint de webhook já existe em: `/api/asaas/webhook` (Next.js App Router).
- Eventos tratados: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` (ativam/reativam beneficiário) e `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`, `PAYMENT_CANCELLED` (desativam).
- Idempotência: cada evento do Asaas é gravado em `webhookEvents/{event.id}` para evitar processamento duplicado.

Configuração no Asaas (Sandbox)
- URL do webhook: `https://<seu-domínio>/api/asaas/webhook`.
- Evento: habilite os eventos de cobrança; mínimo: `PAYMENT_CONFIRMED`.
- Token secreto: defina um segredo e coloque seu valor no header `asaas-access-token` (o painel faz isso automaticamente). No app, configure `ASAAS_WEBHOOK_SECRET`.

Variáveis de ambiente
- Crie `.env.local` a partir de `.env.example`.
- Sandbox do Asaas:
  - `ASAAS_API_URL=https://sandbox.asaas.com/api/v3`
  - `ASAAS_API_KEY=<sua_api_key_sandbox>`
  - `ASAAS_WEBHOOK_SECRET=<seu_token_secreto_de_webhook>`
- Rapidoc API:
  - `RAPIDOC_BASE_URL`, `RAPIDOC_TOKEN`, `RAPIDOC_CLIENT_ID`
- Firebase Admin:
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

Fluxo de processamento
- O Asaas envia `POST` com JSON contendo `event` e `payment`.
- O handler valida o token do header `asaas-access-token` contra `ASAAS_WEBHOOK_SECRET`.
- Idempotência: cria o doc `webhookEvents/{event.id}`; se já existir, o evento é ignorado.
- Resolve/cria o usuário `users` por `asaasCustomerId`. Quando necessário, consulta o cliente no Asaas para obter CPF.
- Monta o payload do beneficiário (`buildBeneficiaryPayload`) e:
  - Em `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`: garante/cria beneficiário e reativa se preciso.
  - Em eventos de cancelamento/atraso: desativa beneficiário.
- Persiste/atualiza o documento do pagamento em `payments/{payment.id}` e registra o evento em `events`.

Testes no Sandbox
- Gere uma cobrança de teste (boleto, Pix ou cartão) e confirme o pagamento.
- Verifique logs do Vercel/servidor e a coleção `webhookEvents`/`payments`/`events` no Firestore.
- Consulte os logs de Webhook no painel do Asaas (Sandbox) para depurar respostas HTTP.

Boas práticas
- Responder rapidamente 2xx (o handler retorna `200 { ok: true }`).
- Manter `ASAAS_WEBHOOK_SECRET` em sigilo e rotacionar quando necessário.
- Evitar inscrever-se em todos os eventos; habilite apenas os usados.