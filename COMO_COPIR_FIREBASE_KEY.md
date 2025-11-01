# 🔑 Como Copiar a Chave Privada do Firebase Corretamente

## ❌ Erro Comum

```
error:1E08010C:DECODER routines::unsupported
```

Este erro significa que a chave privada do Firebase não foi copiada corretamente.

## ✅ Solução Passo a Passo

### Passo 1: Acessar Firebase Console

1. Acesse: https://console.firebase.google.com
2. Selecione seu projeto
3. Vá em: **⚙️ Configurações do Projeto**
4. Aba: **Contas de Serviço**
5. Seção: **Chaves privadas**

### Passo 2: Gerar Nova Chave (se necessário)

Se não houver chave ou a atual estiver corrompida:

1. Clique em **"Gerar nova chave privada"**
2. Confirme a ação
3. O arquivo JSON será baixado automaticamente

**Exemplo de arquivo JSON baixado:**
```json
{
  "type": "service_account",
  "project_id": "seu-projeto",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/..."
}
```

### Passo 3: Copiar Valores para .env.local

Abra o arquivo JSON baixado e copie **EXATAMENTE** como está:

```env
# Firebase Admin (Server)
FIREBASE_PROJECT_ID=seu-projeto-id-aqui
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### ⚠️ IMPORTANTE: Regras de Formatação

#### ✅ CORRETO

```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```

#### ❌ INCORRETO - Nunca faça isso:

```env
# NÃO copie sem as quebras de linha
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----MIIEvQ...-----END PRIVATE KEY-----"

# NÃO adicione espaços extras
FIREBASE_PRIVATE_KEY=" -----BEGIN PRIVATE KEY----- \n..."

# NÃO remova as aspas
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...

# NÃO quebre em múltiplas linhas
FIREBASE_PRIVATE_KEY="-----BEGIN
PRIVATE KEY-----
MIIEvQ...
-----END PRIVATE KEY-----"
```

### Passo 4: Verificar no .env.local

Abra o arquivo `.env.local` e verifique:

```env
# ✅ Tudo em uma linha só
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# ✅ Com aspas duplas envolvendo tudo
# ✅ Com \n para quebras de linha
# ✅ Sem espaços antes ou depois das aspas
```

### Passo 5: Reiniciar o Servidor

Após editar `.env.local`, **sempre reinicie o servidor**:

```bash
# Parar servidor (Ctrl+C)
npm run dev  # Reiniciar
```

## 🔍 Como Verificar se Está Correto

### Teste Rápido

1. Inicie o servidor: `npm run dev`
2. Se ver a mensagem de erro sobre credentials → parar e corrigir
3. Se o servidor iniciar sem erros → provavelmente está correto

### Teste Completo

1. Acesse `/admin/dashboard` no navegador
2. Faça login com sua conta admin
3. Se logar sem erro → **configuração correta** ✅

## 🐛 Troubleshooting

### Erro: "Firebase Admin credentials missing"

**Causa:** Variáveis não foram carregadas  
**Solução:** Verifique se o arquivo é `.env.local` (não `.env`)

### Erro: "DECODER routines::unsupported"

**Causa:** Chave privada com formatação errada  
**Solução:** 
1. Delete a linha FIREBASE_PRIVATE_KEY do .env.local
2. Copie novamente do Firebase Console
3. Certifique-se de que está entre aspas duplas
4. Reinicie servidor

### Erro: "Invalid service account"

**Causa:** Project ID ou Client Email incorretos  
**Solução:** Verifique se copiou corretamente do JSON

### Erro: "forbidden" no admin

**Causa:** Usuário não tem permissão admin  
**Solução:** 
1. Verifique Firestore: coleção `users` > seu usuário
2. Confirme campos: `role: "admin"` ou `isAdmin: true`
3. Verifique `authUid` está correto

## 📝 Exemplo Completo de .env.local

```env
# Firebase Configuration (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyC...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto-id
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789

# Firebase Admin (Server)
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc12@seu-projeto-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Rapidoc API
RAPIDOC_BASE_URL=https://api.rapidoc.com.br
RAPIDOC_TOKEN=seu-token-aqui
RAPIDOC_CLIENT_ID=seu-client-id

# Asaas API (Sandbox)
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
ASAAS_API_KEY=sua-api-key
ASAAS_WEBHOOK_SECRET=seu-webhook-secret
```

## 💡 Dica Extra

Use um editor de texto que **preserve as aspas** e caracteres especiais corretamente:
- ✅ VS Code
- ✅ Notepad++  
- ✅ Sublime Text
- ❌ Bloco de Notas (pode corromper)

## 🆘 Ainda com Problema?

Se ainda assim não funcionar:

1. Delete completamente o arquivo `.env.local`
2. Crie um novo
3. Copie **tudo de uma vez** do Firebase Console
4. Reinicie servidor
5. Tente novamente

Se persistir, o problema pode ser na configuração do Firebase Console. Verifique se o projeto está correto e ativo.

