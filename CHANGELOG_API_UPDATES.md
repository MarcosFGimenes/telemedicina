# Atualizações da API Rapidoc - Changelog

## Resumo
Este documento descreve as mudanças implementadas para suportar a nova API da Rapidoc que utiliza o formato `plans` em vez de `serviceType`.

## Data: 2025-01-XX

## Mudanças Implementadas

### 1. Novo Endpoint de Planos Rapidoc
**Arquivo:** `src/app/api/rapidoc/planos/route.ts`

- Agora busca planos do endpoint `/tema/api/plans` da Rapidoc
- Implementa fallback para planos do Firestore caso a Rapidoc esteja indisponível
- Mantém compatibilidade com código existente

**Antes:**
```typescript
export async function GET() {
  const plans = await listPlans();
  return NextResponse.json(plans);
}
```

**Depois:**
```typescript
export async function GET() {
  try {
    const { data } = await rapidoc.get('/tema/api/plans');
    return NextResponse.json(data);
  } catch (error: any) {
    // Fallback para Firestore
    const plans = await listPlans();
    return NextResponse.json(plans);
  }
}
```

### 2. Atualização do Tipo RapidocBeneficiaryPayload
**Arquivo:** `src/lib/rapidocService.ts`

- Adicionado novo tipo `RapidocPlanItem` para estrutura de planos
- Payload agora suporta tanto o novo formato (`plans`) quanto o antigo (`serviceType`)

**Novo tipo:**
```typescript
export type RapidocPlanItem = {
  paymentType: 'S' | 'A';
  plan: {
    uuid: string;
  };
};

export type RapidocBeneficiaryPayload = {
  // ... campos existentes
  plans?: RapidocPlanItem[];  // NOVO FORMATO
  paymentType?: 'S' | 'A';     // DEPRECATED
  serviceType?: 'G' | 'P' | 'GP' | 'GS' | 'GSP';  // DEPRECATED
  // ...
};
```

### 3. Função para Listar Planos da Rapidoc
**Arquivo:** `src/lib/rapidocService.ts`

- Adicionada função `rapidocListPlans()` que consulta o endpoint `/tema/api/plans`
- Tratamento de erros robusto
- Retorna lista vazia se não houver planos ou em caso de erro

### 4. Atualização da Função rapidocPostBeneficiary
**Arquivo:** `src/lib/rapidocService.ts`

- Função agora prioriza o campo `plans` quando presente
- Mantém compatibilidade com o formato antigo usando `serviceType` e `paymentType`
- Remove campos deprecated automaticamente

**Lógica de prioridade:**
```typescript
// Se plans estiver presente, usar apenas plans
if (one.plans && Array.isArray(one.plans) && one.plans.length > 0) {
  payload.plans = one.plans;
} else {
  // Fallback para formato antigo
  if (one.paymentType) payload.paymentType = one.paymentType;
  if (one.serviceType) payload.serviceType = one.serviceType;
}
```

### 5. Correção na Criação de Dependentes
**Arquivo:** `src/app/api/dependents/create/route.ts`

- Corrigido erro 500 que ocorria quando `serviceType` e `holder` não eram fornecidos
- Agora herda automaticamente `serviceType` e `holder` do usuário titular
- Melhor tratamento de dados faltantes

**Antes:**
```typescript
const payload: RapidocBeneficiaryPayload = {
  name,
  cpf,
  birthday,
  // serviceType e holder poderiam ser undefined
  serviceType: body?.serviceType,
  holder: body?.holder,
};
```

**Depois:**
```typescript
const userCpf = String(userData?.cpf || '').replace(/\D/g, '');
const userServiceType = String(userData?.serviceType || '').trim().toUpperCase();

const payload: RapidocBeneficiaryPayload = {
  name,
  cpf,
  birthday,
  // Herda do usuário titular
  paymentType: (body?.paymentType || userData?.paymentType || 'S') as 'S' | 'A',
  serviceType: (body?.serviceType || userServiceType || 'GS') as any,
  holder: body?.holder || userCpf || undefined,
};
```

### 6. Arquivo .env.local
**Arquivo:** `.env.local`

Criado arquivo com todas as variáveis de ambiente necessárias:

```env
# Firebase Configuration (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=

# Firebase Admin (Server)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Rapidoc API
RAPIDOC_BASE_URL=
RAPIDOC_TOKEN=
RAPIDOC_CLIENT_ID=

# Asaas API (Sandbox)
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
ASAAS_API_KEY=
ASAAS_WEBHOOK_SECRET=
```

## Problemas Corrigidos

### ✅ CRIT-02: Erro 500 na Criação de Dependentes
**Causa:** Campos obrigatórios não eram preenchidos corretamente  
**Solução:** Herda automaticamente dados do titular

### ✅ Endpoint de Planos Atualizado
**Causa:** Endpoint mudou de configuração interna para API externa  
**Solução:** Busca do endpoint correto `/tema/api/plans` com fallback

### ✅ Compatibilidade com Nova API
**Causa:** API mudou formato de `serviceType` para `plans`  
**Solução:** Suporte dual - novo e antigo formato

## Próximos Passos (Não Implementados)

### ⚠️ Migração Completa para Novo Formato
Para utilizar completamente o novo formato `plans`, será necessário:

1. **Mapear UUIDs dos Planos:**
   - Buscar lista de planos da Rapidoc
   - Criar mapping entre `serviceType` (Firestore) e `uuid` (Rapidoc)
   - Atualizar `buildBeneficiaryPayload` para gerar array `plans`

2. **Atualizar Fluxo de Checkout:**
   - Modificar `src/app/api/checkout/finalizar/route.ts`
   - Atualizar `src/lib/beneficiaryPayload.ts`
   - Incluir conversão de planos

3. **Webhook Asaas:**
   - Atualizar `src/app/api/asaas/webhook/route.ts` para usar `plans`

## Testes Recomendados

1. ✅ Teste criar beneficiário com formato antigo (serviceType)
2. ⏳ Teste criar beneficiário com formato novo (plans)
3. ✅ Teste criar dependente (corrigido Erro 500)
4. ✅ Teste consultar planos da Rapidoc
5. ⏳ Teste webhook Asaas com novo formato

## Compatibilidade

- ✅ **Código existente:** Totalmente compatível
- ✅ **Novo formato:** Suportado quando `plans` for fornecido
- ✅ **Fallback:** Sempre disponível para Firestore

## Notas Técnicas

- A API Rapidoc agora exige Content-Type: `application/vnd.rapidoc.tema-v2+json` (já implementado)
- Headers necessários: `Authorization`, `clientId` (já implementados)
- Payload pode incluir múltiplos planos em array
- `paymentType` deve corresponder ao retornado em GET /plans
- Exceção: `paymentType` 'L' permite escolher 'S' ou 'A'

## Referências

- Documentação Rapidoc: NovosEdpointsPlanos.docx
- Endpoint Planos: GET `/tema/api/plans`
- Endpoint Beneficiários: POST `/tema/api/beneficiaries`
- Endpoint Atualizar: PUT `/tema/api/beneficiaries/{uuid}`

