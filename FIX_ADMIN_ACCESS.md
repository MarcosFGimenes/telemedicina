# 🔧 Correção de Acesso Admin - Guia Rápido

## ❌ Erro Atual

```
error:1E08010C:DECODER routines::unsupported
GET /api/admin/access 500
forbidden
```

## ✅ Solução em 2 Minutos

### 1. Editar .env.local

Abra o arquivo `.env.local` e localize a linha:

```env
FIREBASE_PRIVATE_KEY=...
```

### 2. Corrigir Formatação

A chave deve estar **EXATAMENTE** assim:

```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...[sua-chave-aqui]...\n-----END PRIVATE KEY-----\n"
```

**Regras:**
- ✅ Entre aspas duplas `"`
- ✅ Em uma linha só
- ✅ Com `\n` para quebras de linha
- ✅ Sem espaços extras

### 3. Copiar do Firebase Console

Se a chave está incorreta:

1. https://console.firebase.google.com → Seu Projeto
2. ⚙️ Configurações → Contas de Serviço
3. Seção "Chaves privadas" → Gerar nova chave privada
4. Baixar JSON
5. Abrir JSON → copiar `private_key` completo
6. Colar em `.env.local`

### 4. Reiniciar Servidor

```bash
# No terminal onde o servidor está rodando:
Ctrl+C  # Parar

npm run dev  # Reiniciar
```

### 5. Testar

1. Acesse `/admin/dashboard` no navegador
2. Faça login
3. Se funcionar → ✅ **PROBLEMA RESOLVIDO!**

---

## 📋 Checklist Rápido

- [ ] `.env.local` existe?
- [ ] `FIREBASE_PRIVATE_KEY` está entre aspas?
- [ ] Chave está em uma linha só?
- [ ] Tem `\n` para quebras de linha?
- [ ] Servidor foi reiniciado após editar?
- [ ] Usuário no Firestore tem `role: "admin"` ou `isAdmin: true`?

---

## 🆘 Ainda não funciona?

**Leia:** `COMO_COPIR_FIREBASE_KEY.md`

Este arquivo tem instruções **super detalhadas** com exemplos visuais!

