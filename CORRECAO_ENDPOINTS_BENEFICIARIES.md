# 🔧 Correção dos Endpoints de Beneficiários

## ❌ Problema Identificado

Os endpoints estavam usando `/beneficiaries` em vez de `/tema/api/beneficiaries`, e o frontend estava enviando campos deprecated (`holder`, `paymentType`, `serviceType`) em vez do novo formato `plans`.

## ✅ Correções Implementadas

### 1. **Endpoint `/api/rapidoc/beneficiaries`**

**Arquivo:** `src/app/api/rapidoc/beneficiaries/route.ts`

**Antes:**
```typescript
const { data } = await rapidoc.post('/beneficiaries', body);
const { data } = await rapidoc.get('/beneficiaries');
```

**Depois:**
```typescript
const { data } = await rapidoc.post('/tema/api/beneficiaries', body);
const { data } = await rapidoc.get('/tema/api/beneficiaries');
```

### 2. **Função `rapidocPostBeneficiary`**

**Arquivo:** `src/lib/rapidocService.ts`

**Antes:**
```typescript
const { data } = await rapidoc.post('/beneficiaries', body);
```

**Depois:**
```typescript
const { data } = await rapidoc.post('/tema/api/beneficiaries', body);
```

### 3. **Função `rapidocListBeneficiaries`**

**Arquivo:** `src/lib/rapidocService.ts`

**Antes:**
```typescript
const { data } = await rapidoc.get('/beneficiaries', { params: query });
```

**Depois:**
```typescript
const { data } = await rapidoc.get('/tema/api/beneficiaries', { params: query });
```

### 4. **Frontend `createBeneficiary`**

**Arquivo:** `src/components/checkout/CheckoutExperience.tsx`

**Antes:**
```typescript
const createBeneficiary = async (): Promise<boolean> => {
  const payload = [form]; // Enviava tudo, incluindo campos deprecated
  const { data } = await axios.post('/api/rapidoc/beneficiaries', payload);
  return true;
};
```

**Depois:**
```typescript
const createBeneficiary = async (): Promise<boolean> => {
  const beneficiaryPayload: Record<string, unknown> = {
    name: form.name,
    cpf: form.cpf,
    birthday: form.birthday,
  };
  
  // Campos opcionais
  if (form.phone) beneficiaryPayload.phone = form.phone;
  if (form.email) beneficiaryPayload.email = form.email;
  // ... outros campos
  
  // NOVO: Usar plans se tiver rapidocUuid no plano
  if (selectedPlan?.rapidocUuid) {
    beneficiaryPayload.plans = [
      {
        paymentType: form.paymentType || 'S',
        plan: { uuid: selectedPlan.rapidocUuid },
      },
    ];
  } else {
    // Fallback para formato antigo (backward compatibility)
    if (form.paymentType) beneficiaryPayload.paymentType = form.paymentType;
    if (form.serviceType) beneficiaryPayload.serviceType = form.serviceType;
  }
  
  const payload = [beneficiaryPayload];
  const { data } = await axios.post('/api/rapidoc/beneficiaries', payload);
  return true;
};
```

### 5. **Remoção do Campo `holder`**

**Arquivo:** `src/components/checkout/CheckoutExperience.tsx`

Removido o campo "CPF do titular responsável" do formulário:

**Antes:**
```typescript
[
  'name', 'cpf', 'birthday', 'phone', 'email',
  'zipCode', 'address', 'city', 'state',
  'holder', // ❌ REMOVIDO
  'general',
]
```

**Depois:**
```typescript
[
  'name', 'cpf', 'birthday', 'phone', 'email',
  'zipCode', 'address', 'city', 'state',
  'general',
]
```

## 📊 Formato da Resposta

### Formato Esperado pela API Rapidoc:

```json
[
  {
    "name": "João Silva",
    "cpf": "34088529014",
    "birthday": "1984-12-12",
    "phone": "51993949830",
    "email": "rapidoc2025101501@gmail.com",
    "zipCode": "91060000",
    "address": "Rua Teste",
    "city": "Porto Alegre",
    "state": "RS",
    "plans": [
      {
        "paymentType": "S",
        "plan": {
          "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44"
        }
      }
    ]
  }
]
```

## ✅ Resultado

Agora o sistema:
1. ✅ Usa os endpoints corretos: `/tema/api/beneficiaries`
2. ✅ Monta payload com `plans` quando `rapidocUuid` está disponível
3. ✅ Mantém fallback para formato antigo (backward compatibility)
4. ✅ Removido campo `holder` desnecessário
5. ✅ Logs detalhados adicionados para debugging
6. ✅ Headers corretos aplicados automaticamente

## 🔄 Compatibilidade

- ✅ Plano **COM** `rapidocUuid` → Usa formato novo `plans`
- ✅ Plano **SEM** `rapidocUuid` → Usa formato antigo `serviceType`
- ✅ Backend endpoints já atualizados (`checkout/finalizar`, `webhook`, etc.)
- ✅ Frontend agora também usa formato correto

## 🧪 Como Testar

1. Acesse `/assinar/{slug}` no navegador
2. Preencha o formulário de beneficiário
3. Selecione um plano (se tiver `rapidocUuid`, usará formato novo)
4. Confirme a assinatura e pague
5. Verifique os logs do servidor para confirmar formato enviado
6. Confirme que o beneficiário foi criado na Rapidoc

## 📝 Logs Esperados

```
[rapidoc/beneficiaries] POST body: [{"name":"João Silva","cpf":"34088529014",...}]
[rapidoc:req:xxxxx] POST https://sandbox.rapidoc.tech/tema/api/beneficiaries
[rapidoc:res:xxxxx] 200 (xxxms)
[rapidoc/beneficiaries] POST response: {...}
```

## 📚 Referências

- Documentação API: Endpoint `POST /tema/api/beneficiaries`
- CHANGELOG: `CHANGELOG_API_UPDATES.md`
- Anterior: `CORRECAO_ESTRUTURA_API.md`

