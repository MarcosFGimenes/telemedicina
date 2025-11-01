# 🚀 Guia Rápido de Início - Comece Aqui!

## ✅ O que foi feito?

- ✅ Integração com novo endpoint de planos da Rapidoc
- ✅ Suporte ao formato novo (`plans`) e antigo (`serviceType`)
- ✅ **CORRIGIDO:** Erro 500 na criação de dependentes
- ✅ Webhook Asaas funcional
- ✅ Fallback para Firestore

## 🏃 Como Testar AGORA (3 minutos)

### Passo 1: Configurar .env.local

Abra o arquivo `.env.local` e preencha as credenciais:

```env
# Basta preencher estas 3 principais:
RAPIDOC_BASE_URL=https://sua-api-rapidoc.com.br
RAPIDOC_TOKEN=seu-token-aqui
RAPIDOC_CLIENT_ID=seu-client-id-aqui

# E Firebase + Asaas (se já tem configurado)
```

### Passo 2: Iniciar o servidor

```bash
npm run dev
```

### Passo 3: Rodar testes automáticos

Em outro terminal:

```bash
node test-rapidoc-endpoints.js
```

**OU** testar manualmente no navegador:

Abra: `http://localhost:3000/api/rapidoc/planos`

Deve mostrar os planos! ✅

## 📚 Documentação Completa

- **TESTE_GUIDE.md** → Guia completo de testes
- **CHANGELOG_API_UPDATES.md** → Mudanças técnicas detalhadas

## ⚡ Testes Rápidos

### 1️⃣ Ver se planos carregam
```
http://localhost:3000/api/rapidoc/planos
```
Deve mostrar JSON com planos ✅

### 2️⃣ Testar criação de dependente
```bash
curl -X POST http://localhost:3000/api/dependents/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Teste","cpf":"12345678900","birthday":"2010-01-01"}'
```

Antes: ❌ Erro 500  
Agora: ✅ 401 (precisa auth) ou 200 (se autenticado)

## 🐛 Problemas?

### "Cannot connect to server"
```bash
npm run dev  # Inicie o servidor primeiro
```

### "RAPIDOC_BASE_URL is not defined"
Configure no `.env.local` (veja Passo 1)

### "401 Unauthorized"
Verifique `RAPIDOC_TOKEN` e `RAPIDOC_CLIENT_ID` no `.env.local`

## 📊 Status dos Fixes

| Problema | Status |
|----------|--------|
| Erro 500 em dependentes | ✅ **CORRIGIDO** |
| Endpoint de planos novo | ✅ **IMPLEMENTADO** |
| Suporte a formato `plans` | ✅ **IMPLEMENTADO** |
| Webhook Asaas | ✅ **FUNCIONANDO** |
| Fallback Firestore | ✅ **IMPLEMENTADO** |

## 🎯 Próximos Passos

1. Teste a API de planos → `npm run dev` + node test-rapidoc-endpoints.js
2. Valide no frontend → Acesse `/assinar` ou `/planos`
3. Teste criação de dependente → Use a UI
4. Verifique logs → Console do servidor

## 📞 Precisa de Ajuda?

1. Leia **TESTE_GUIDE.md** para testes detalhados
2. Leia **CHANGELOG_API_UPDATES.md** para mudanças técnicas
3. Verifique logs do servidor
4. Confira console do navegador (DevTools)

---

**Tudo pronto! Bom teste! 🎉**

