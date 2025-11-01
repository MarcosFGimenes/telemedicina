# Guia de Testes - Atualizações da API Rapidoc

## 📋 Pré-requisitos

Antes de começar, certifique-se de que:

1. ✅ Arquivo `.env.local` está configurado com todas as credenciais
2. ✅ Dependências instaladas: `npm install`
3. ✅ Servidor rodando: `npm run dev`

## 🔧 Configuração do .env.local

Certifique-se de preencher todas as variáveis no arquivo `.env.local`:

```env
# Firebase Configuration (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=sua-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto-id
NEXT_PUBLIC_FIREBASE_APP_ID=1:seu-app-id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=seu-sender-id

# Firebase Admin (Server)
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSua-chave-privada-aqui\n-----END PRIVATE KEY-----"

# Rapidoc API
RAPIDOC_BASE_URL=https://api.rapidoc.com.br
RAPIDOC_TOKEN=seu-token-rapidoc
RAPIDOC_CLIENT_ID=seu-client-id

# Asaas API (Sandbox)
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
ASAAS_API_KEY=sua-api-key-asaas
ASAAS_WEBHOOK_SECRET=seu-webhook-secret
```

## 🧪 Testes por Categoria

### 1️⃣ Teste: Consultar Planos da Rapidoc

**Endpoint:** `GET /api/rapidoc/planos`

**Como testar:**
```bash
curl http://localhost:3000/api/rapidoc/planos
```

**ou no navegador:**
```
http://localhost:3000/api/rapidoc/planos
```

**Resultado esperado:**
- ✅ Deve retornar array de planos da Rapidoc
- ✅ Cada plano deve ter: `uuid`, `name`, `description`, `serviceType`, `values`
- ✅ Se a Rapidoc estiver offline, deve retornar planos do Firestore como fallback

**Verificar:**
```json
[
  {
    "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44",
    "name": "Plano Individual",
    "description": "Descrição do plano",
    "serviceType": "GS",
    "values": [...]
  }
]
```

---

### 2️⃣ Teste: Criar Beneficiário (Formato Antigo)

**Endpoint:** `POST /api/rapidoc/beneficiaries`

**Como testar:**
```bash
curl -X POST http://localhost:3000/api/rapidoc/beneficiaries \
  -H "Content-Type: application/json" \
  -d '[
    {
      "name": "João Silva",
      "cpf": "34088529014",
      "birthday": "1984-12-12",
      "phone": "51993949830",
      "email": "teste@example.com",
      "serviceType": "GS",
      "paymentType": "S"
    }
  ]'
```

**Resultado esperado:**
- ✅ Deve criar beneficiário usando formato antigo (`serviceType`)
- ✅ Deve retornar dados do beneficiário criado
- ✅ Status 200 OK

---

### 3️⃣ Teste: Criar Beneficiário (Formato Novo)

**Endpoint:** `POST /api/rapidoc/beneficiaries`

**Como testar:**
```bash
curl -X POST http://localhost:3000/api/rapidoc/beneficiaries \
  -H "Content-Type: application/json" \
  -d '[
    {
      "name": "Maria Santos",
      "cpf": "12345678900",
      "birthday": "1990-05-15",
      "phone": "51987654321",
      "email": "maria@example.com",
      "plans": [
        {
          "paymentType": "S",
          "plan": {
            "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44"
          }
        }
      ]
    }
  ]'
```

**Resultado esperado:**
- ✅ Deve criar beneficiário usando formato novo (`plans`)
- ✅ Deve retornar dados do beneficiário criado
- ✅ Status 200 OK

**⚠️ Importante:** Para este teste, você precisa do UUID correto dos planos da Rapidoc. Use o endpoint de planos (teste 1) para obter os UUIDs válidos.

---

### 4️⃣ Teste: Criar Dependente (CORRIGIDO)

**Endpoint:** `POST /api/dependents/create`

**Pré-requisito:** Você precisa estar autenticado (token JWT do Firebase)

**Como testar:**

Primeiro, obtenha seu token:
```bash
# No navegador, faça login e pegue o token do localStorage ou sessionStorage
# ou use o DevTools > Application > Local Storage > auth-token
```

Depois:
```bash
curl -X POST http://localhost:3000/api/dependents/create \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Filho Teste",
    "cpf": "11122233344",
    "birthday": "2010-01-01"
  }'
```

**Resultado esperado:**
- ✅ Deve criar dependente com sucesso
- ✅ Deve herdar `serviceType` e `holder` do titular automaticamente
- ✅ Não deve retornar erro 500
- ✅ Status 200 OK

**Antes (BUG):** ❌ Erro 500  
**Depois (CORRIGIDO):** ✅ Sucesso

---

### 5️⃣ Teste: Webhook Asaas (Simulação)

**Endpoint:** `POST /api/asaas/webhook`

**Como testar:**

Simular pagamento confirmado:
```bash
curl -X POST http://localhost:3000/api/asaas/webhook \
  -H "asaas-access-token: SEU_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "PAYMENT_CONFIRMED",
    "payment": {
      "id": "pay_123456",
      "customer": "cus_123456",
      "status": "CONFIRMED",
      "value": 69.90,
      "billingType": "PIX"
    }
  }'
```

**Resultado esperado:**
- ✅ Deve ativar beneficiário se for evento de pagamento confirmado
- ✅ Deve desativar beneficiário se for evento de cancelamento
- ✅ Deve criar/atualizar documento no Firestore
- ✅ Status 200 OK

**Tipos de eventos para testar:**
- `PAYMENT_CONFIRMED` → Ativa beneficiário
- `PAYMENT_RECEIVED` → Ativa beneficiário
- `PAYMENT_OVERDUE` → Desativa beneficiário
- `PAYMENT_REFUNDED` → Desativa beneficiário

---

### 6️⃣ Teste: Fluxo de Checkout Completo

**Endpoints envolvidos:**
- `POST /api/checkout/pagar` → Criar cobrança
- `POST /api/checkout/finalizar` → Finalizar checkout

**Como testar via UI:**
1. Acesse: `http://localhost:3000/assinar/[slug-do-plano]`
2. Preencha formulário de checkout
3. Escolha método de pagamento
4. Complete o fluxo

**Verificar no console do servidor:**
- ✅ Logs de chamadas à API Rapidoc
- ✅ Sucesso na criação do beneficiário
- ✅ Atualização do Firestore
- ✅ Sem erros de integração

---

### 7️⃣ Teste: Fallback de Planos

**Como testar:**

Simular falha da API Rapidoc (desligue WiFi temporariamente ou digite URL errada no .env):

```bash
# No .env.local, mude temporariamente:
RAPIDOC_BASE_URL=https://api-inexistente.rapidoc.com.br
```

Depois tente:
```bash
curl http://localhost:3000/api/rapidoc/planos
```

**Resultado esperado:**
- ✅ Deve retornar planos do Firestore como fallback
- ✅ Status 200 OK (não deve retornar erro)
- ✅ Log no console indicando fallback

Restaure o `.env.local` após o teste.

---

## 🔍 Verificações Adicionais

### No Firestore Console

Verificar se os dados estão sendo salvos corretamente:

**Coleção: `users`**
- ✅ Beneficiários criados têm `beneficiaryUuid` preenchido
- ✅ `status` atualizado corretamente (active/inactive)
- ✅ `asaasCustomerId` linkado corretamente

**Coleção: `dependents`**
- ✅ Dependentes têm `ownerUid` correto
- ✅ `uuid` da Rapidoc preenchido
- ✅ `status` ativo

**Coleção: `payments`**
- ✅ Pagamentos sincronizados do Asaas
- ✅ `processed` marcado quando confirmado
- ✅ Relacionamento com `customerId` correto

**Coleção: `webhookEvents`**
- ✅ Eventos registrados para idempotência
- ✅ Sem duplicatas

### No Console do Navegador (DevTools)

Verificar chamadas de API:
- ✅ Requests para `/api/rapidoc/*` bem-sucedidas
- ✅ Headers corretos (Authorization, clientId)
- ✅ Payloads no formato correto
- ✅ Sem erros de CORS

### No Terminal/Console do Servidor

Verificar logs:
```
✅ [rapidoc:req:xxx] GET https://api.rapidoc.com.br/tema/api/plans
✅ [rapidoc:res:xxx] 200 (XXXms)
✅ [checkout/finalizar] success
✅ [asaas/webhook] processed
```

---

## 🐛 Problemas Comuns e Soluções

### Erro: "RAPIDOC_BASE_URL is not defined"
**Solução:** Configure `RAPIDOC_BASE_URL` no `.env.local`

### Erro: 401 Unauthorized nas chamadas Rapidoc
**Solução:** Verifique `RAPIDOC_TOKEN` e `RAPIDOC_CLIENT_ID`

### Erro: Firebase Auth (auth/invalid-credential)
**Solução:** Verifique credenciais do Firebase no `.env.local`

### Dependentes ainda retornam erro 500
**Solução:** Certifique-se de que o serviço está usando a versão atualizada do código
```bash
npm run build  # Rebuild do projeto
npm run dev    # Reiniciar servidor
```

### Planos não retornam da Rapidoc
**Solução:** Verifique se o endpoint `/tema/api/plans` está correto e acessível

---

## 📊 Checklist Final

Antes de considerar os testes completos, verifique:

- [ ] Planos da Rapidoc carregando corretamente
- [ ] Beneficiários criando no formato antigo
- [ ] Beneficiários criando no formato novo (quando possível)
- [ ] Dependentes criando sem erro 500
- [ ] Webhook Asaas processando eventos
- [ ] Checkout completo funcionando
- [ ] Fallback de planos funcionando
- [ ] Dados salvos corretamente no Firestore
- [ ] Logs sem erros críticos
- [ ] Frontend exibindo dados corretamente

---

## 📝 Notas Importantes

1. **UUIDs dos Planos:** Você precisa dos UUIDs reais da Rapidoc para testar o formato novo. Use o teste 1 para obter.

2. **Autenticação:** Para testes de dependentes, você precisa estar logado. Use o fluxo de "Primeiro Acesso" se necessário.

3. **Sandbox:** A Asaas está em modo sandbox, então use dados de teste.

4. **Logs:** Sempre verifique os logs do servidor para debugging detalhado.

5. **Cache:** Após mudanças no `.env.local`, você pode precisar reiniciar o servidor:
```bash
# Parar servidor (Ctrl+C)
npm run dev  # Reiniciar
```

---

## 🚀 Próximos Passos

Após validar todos os testes:

1. ✅ Testar em ambiente de staging
2. ✅ Deploy para produção
3. ✅ Monitorar logs de produção
4. ⏳ Migrar completamente para o formato novo quando possível

---

Boa sorte nos testes! 🎉

