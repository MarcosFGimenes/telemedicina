# 🔧 Correção da Estrutura de Dados da API Rapidoc

## ❌ Problema Identificado

A API Rapidoc retorna os dados em uma **estrutura aninhada**, mas o sistema estava esperando uma estrutura plana.

### Resposta Real da API:

```json
[
  {
    "paymentType": "S",
    "plan": {
      "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44",
      "name": "Premium",
      "description": "Plano Premium (Generalista 24/7 + Especialidades)",
      "serviceType": "GS",
      "specialties": [
        {
          "name": "Urologia",
          "uuid": "c9789d0b-5f22-46fd-93a5-81dad1d00462"
        }
      ]
    }
  }
]
```

### Estrutura Esperada Pelo Sistema:

```json
[
  {
    "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44",
    "name": "Premium",
    "description": "Plano Premium (Generalista 24/7 + Especialidades)",
    "serviceType": "GS",
    "specialties": [...]
  }
]
```

## ✅ Solução Implementada

### 1. **Novos Types TypeScript**

```typescript
// Estrutura completa da resposta da API
export type RapidocPlanResponse = {
  paymentType: 'S' | 'A' | string;
  plan: RapidocPlanDetails;
};

// Estrutura dos detalhes do plano (extraído de plan)
export type RapidocPlanDetails = {
  uuid: string;
  name: string;
  description: string;
  serviceType: string;
  specialties: RapidocSpecialty[];
  isActive?: boolean;
};

// Type alias para compatibilidade
export type RapidocPlan = RapidocPlanDetails;
```

### 2. **Atualização do Endpoint `/api/rapidoc/planos`**

**Arquivo:** `src/app/api/rapidoc/planos/route.ts`

**Antes:**
```typescript
export async function GET() {
  const { data } = await rapidoc.get('/tema/api/plans');
  return NextResponse.json(data);
}
```

**Depois:**
```typescript
export async function GET() {
  const { data } = await rapidoc.get<RapidocPlanResponse[]>('/tema/api/plans');
  // Extrair plan de cada item e transformar em array de RapidocPlanDetails
  const extractedPlans: RapidocPlanDetails[] = Array.isArray(data)
    ? data.map((item) => item.plan).filter(Boolean)
    : [];
  return NextResponse.json(extractedPlans);
}
```

### 3. **Nova Função de Helper**

**Arquivo:** `src/lib/rapidocService.ts`

Adicionada função `rapidocListPlansDetails()` que já retorna os planos extraídos:

```typescript
export async function rapidocListPlansDetails(): Promise<RapidocPlanDetails[]> {
  const { data } = await rapidoc.get<RapidocPlanResponse[]>('/tema/api/plans');
  if (Array.isArray(data)) {
    return data.map((item) => item.plan).filter(Boolean);
  }
  if (isRecord(data) && data.success === false) {
    return [];
  }
  return [];
}
```

## 📊 Fluxo de Dados

```
GET /tema/api/plans (Rapidoc API)
        ↓
{
  paymentType: "S",
  plan: { uuid, name, description, serviceType, specialties[] }
}
        ↓
Extrair .plan de cada item
        ↓
{
  uuid, name, description, serviceType, specialties[]
}
        ↓
GET /api/rapidoc/planos
        ↓
Frontend (/admin/planos)
        ↓
Dropdown + Visualização de Especialidades
```

## 🧪 Testes

### Entrada (API Rapidoc):
```json
[
  {
    "paymentType": "S",
    "plan": {
      "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44",
      "name": "Premium",
      "description": "Plano Premium (Generalista 24/7 + Especialidades)",
      "serviceType": "GS",
      "specialties": [
        {
          "name": "Urologia",
          "uuid": "c9789d0b-5f22-46fd-93a5-81dad1d00462"
        },
        {
          "name": "Ginecologia e Obstetrícia",
          "uuid": "53b84e64-7691-4fa2-8bc9-0f0678ef2957"
        }
      ]
    }
  }
]
```

### Saída (Nosso Endpoint):
```json
[
  {
    "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44",
    "name": "Premium",
    "description": "Plano Premium (Generalista 24/7 + Especialidades)",
    "serviceType": "GS",
    "specialties": [
      {
        "name": "Urologia",
        "uuid": "c9789d0b-5f22-46fd-93a5-81dad1d00462"
      },
      {
        "name": "Ginecologia e Obstetrícia",
        "uuid": "53b84e64-7691-4fa2-8bc9-0f0678ef2957"
      }
    ]
  }
]
```

## ✅ Resultado

Agora o sistema:
1. ✅ Recebe corretamente os dados da API Rapidoc
2. ✅ Extrai o objeto `plan` de cada item da resposta
3. ✅ Transforma em array de planos detalhados
4. ✅ Exibe no dropdown da tela `/admin/planos`
5. ✅ Mostra especialidades em badges
6. ✅ Permite seleção visual de planos
7. ✅ Preenche automaticamente o UUID ao selecionar

## 🔄 Compatibilidade

- ✅ Mantida compatibilidade com código existente
- ✅ Type alias `RapidocPlan` para facilitar migração
- ✅ Fallback para Firestore em caso de erro
- ✅ Sem breaking changes

## 📝 Arquivos Modificados

1. **`src/lib/rapidocService.ts`**
   - Adicionados types: `RapidocPlanResponse`, `RapidocPlanDetails`
   - Nova função: `rapidocListPlansDetails()`

2. **`src/app/api/rapidoc/planos/route.ts`**
   - Extração de `plan` de cada item
   - Tipagem com `RapidocPlanResponse[]`

## 🚀 Como Verificar

1. Acesse `/admin/planos` no navegador
2. Clique em "Editar" em um plano
3. Verifique se o dropdown carrega os 3 planos da Rapidoc:
   - Premium (9 especialidades)
   - Psicologia (1 especialidade)
   - Básico (0 especialidades)
4. Selecione um plano e confirme que as especialidades aparecem

## 📚 Referências

- Documentação anterior: `SELETOR_PLANOS_RAPIDOC.md`
- Changelog: `CHANGELOG_API_UPDATES.md`
- Teste do endpoint: `test-rapidoc-endpoints.js`

