# 🧪 Guia de Teste - Seletor de Planos da Rapidoc

## ⚠️ Verificações Necessárias

O endpoint `/api/rapidoc/planos` está retornando array vazio. Verifique:

### 1. Variáveis de Ambiente

Certifique-se de que o `.env.local` está configurado:

```env
RAPIDOC_BASE_URL=https://sandbox.rapidoc.tech
RAPIDOC_TOKEN=seu-token-aqui
RAPIDOC_CLIENT_ID=seu-client-id-aqui
```

### 2. Teste Manual no Postman/Insomnia

**Endpoint:** `GET https://sandbox.rapidoc.tech/tema/api/plans`

**Headers:**
```
clientId: {RAPIDOC_CLIENT_ID}
Authorization: Bearer {RAPIDOC_TOKEN}
Content-Type: application/vnd.rapidoc.tema-v2+json
```

**Resposta Esperada:**
```json
[
  {
    "uuid": "22bea4dd-ee7f-4c8b-8cd2-747e1752f72d",
    "name": "Básico",
    "description": "Plano Básico (Generalista 24/7)",
    "isActive": true,
    "serviceType": "GENERALIST",
    "specialties": []
  },
  {
    "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44",
    "name": "Premium",
    "description": "Plano Premium (Generalista 24/7 + Especialidades)",
    "isActive": true,
    "serviceType": "GENERALIST_AND_SPECIALIST",
    "specialties": [...]
  }
]
```

### 3. Verificar Logs do Servidor

Quando você fizer uma requisição para `http://localhost:3000/api/rapidoc/planos`, verifique os logs do terminal onde está rodando `npm run dev`.

**Procure por:**
- `[rapidoc:req:xxxx]` - mostra os headers sendo enviados
- `[rapidoc:res:xxxx]` - mostra a resposta recebida
- `[rapidoc/planos]` - mostra nosso log customizado

### 4. Possíveis Problemas

#### Problema A: Headers Incorretos

**Sintoma:** Resposta 401 Unauthorized ou erro similar  
**Solução:** Verifique `RAPIDOC_TOKEN` e `RAPIDOC_CLIENT_ID`

#### Problema B: Base URL Incorreta

**Sintoma:** Erro de conexão ou timeout  
**Solução:** Verifique `RAPIDOC_BASE_URL` está como `https://sandbox.rapidoc.tech`

#### Problema C: Formato da Resposta

**Sintoma:** Resposta vazia ou formato diferente do esperado  
**Solução:** Verifique os logs para ver o que realmente está sendo retornado

## 🔍 Debug Passo a Passo

### Passo 1: Verificar Variáveis

Adicione temporariamente no início de `src/lib/rapidoc.ts`:

```typescript
console.log('[DEBUG] RAPIDOC_BASE_URL:', process.env.RAPIDOC_BASE_URL);
console.log('[DEBUG] RAPIDOC_TOKEN:', process.env.RAPIDOC_TOKEN ? '***PRESENTE***' : 'AUSENTE');
console.log('[DEBUG] RAPIDOC_CLIENT_ID:', process.env.RAPIDOC_CLIENT_ID);
```

### Passo 2: Testar Requisição Direta

Crie um arquivo `test-direct.js` na raiz:

```javascript
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

async function test() {
  try {
    const response = await axios.get('https://sandbox.rapidoc.tech/tema/api/plans', {
      headers: {
        'clientId': process.env.RAPIDOC_CLIENT_ID,
        'Authorization': `Bearer ${process.env.RAPIDOC_TOKEN}`,
        'Content-Type': 'application/vnd.rapidoc.tema-v2+json'
      }
    });
    console.log('Success!', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
```

Execute: `node test-direct.js`

### Passo 3: Comparar com o Navegador

Acesse: `http://localhost:3000/api/rapidoc/planos`

Deve retornar JSON com os planos ou uma mensagem de erro explicativa.

## ✅ Checklist Final

Antes de considerar o problema resolvido:

- [ ] Postman/Insomnia retorna os planos corretamente
- [ ] `.env.local` está configurado corretamente
- [ ] Servidor Next.js está rodando (`npm run dev`)
- [ ] Acessar `/api/rapidoc/planos` retorna os planos
- [ ] Tela `/admin/planos` carrega e mostra os planos no dropdown
- [ ] Selecionar um plano mostra as especialidades corretamente

## 📋 Mudanças Implementadas

1. ✅ Corrigido Content-Type apenas para POST/PUT/PATCH
2. ✅ Estrutura de types atualizada para resposta da API
3. ✅ Endpoint `/api/rapidoc/planos` retorna array de planos
4. ✅ Logs detalhados adicionados para debugging
5. ✅ Fallback para Firestore se Rapidoc falhar

## 🎯 Estrutura da Resposta

A API retorna:
```typescript
type RapidocPlanDetails = {
  uuid: string;
  name: string;
  description: string;
  serviceType: string;
  isActive?: boolean;
  specialties: Array<{
    name: string;
    uuid: string;
  }>;
}[]
```

## 📞 Próximos Passos

Se após todos esses testes ainda não funcionar, envie:

1. Logs completos do terminal (`npm run dev`)
2. Resposta do Postman testando diretamente a Rapidoc
3. Conteúdo do `.env.local` (sem os valores sensíveis, só as chaves)
4. Saída do `test-direct.js`

Com essas informações posso ajudar a identificar exatamente onde está o problema!

