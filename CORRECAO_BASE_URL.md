# 🔧 Correção da URL Base da Rapidoc

## ⚠️ Problema Crítico Identificado

Se você configurou no `.env.local`:

```env
RAPIDOC_BASE_URL=https://sandbox.rapidoc.tech/tema/api
```

Isso está **ERRADO**! ❌

## ❌ Por que está errado?

O código já adiciona `/tema/api` nos paths:

```typescript
rapidoc.post('/tema/api/beneficiaries')
rapidoc.get('/tema/api/plans')
```

Se a base URL já incluir `/tema/api`, a URL final ficará:

```
https://sandbox.rapidoc.tech/tema/api/tema/api/beneficiaries  ❌ ERRADO
```

## ✅ Solução

Edite o arquivo `.env.local` e use **apenas a base**:

```env
RAPIDOC_BASE_URL=https://sandbox.rapidoc.tech
```

## 📋 URLs Finais Montadas

Com a configuração correta, o sistema monta:

- **Plans:** `https://sandbox.rapidoc.tech/tema/api/plans`
- **Beneficiaries:** `https://sandbox.rapidoc.tech/tema/api/beneficiaries`

## 🔄 Após Corrigir

1. Edite `.env.local`
2. Altere para: `RAPIDOC_BASE_URL=https://sandbox.rapidoc.tech`
3. **Reinicie o servidor** (`npm run dev`)
4. Teste novamente

## 🧪 Verificação

Depois de reiniciar, verifique os logs:

```
[rapidoc:req:xxxxx] POST https://sandbox.rapidoc.tech/tema/api/beneficiaries ✅ CORRETO
```

Se você vir:

```
[rapidoc:req:xxxxx] POST https://sandbox.rapidoc.tech/tema/api/tema/api/beneficiaries ❌ ERRADO
```

Significa que ainda está configurado incorretamente.

## 📝 Template Correto do .env.local

```env
# Rapidoc API
RAPIDOC_BASE_URL=https://sandbox.rapidoc.tech
RAPIDOC_TOKEN=seu-token-aqui
RAPIDOC_CLIENT_ID=seu-client-id-aqui
```

## 🆘 Ainda com Problema?

Se mesmo assim não funcionar:

1. Verifique se salvo no arquivo `.env.local` (não `.env`)
2. Reiniciou o servidor após editar?
3. Confirme que não há espaços antes/depois da URL
4. Verifique os logs do servidor para ver a URL sendo usada

