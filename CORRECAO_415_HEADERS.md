# 🔧 Correção do Erro 415 - Unsupported Media Type

## ❌ Erro Identificado

```
[rapidoc:err:xxxxx] 415 (26ms) data=
[rapidoc/beneficiaries] POST error: Request failed with status code 415
```

**Causa:** Headers `Accept` e `Content-Type` estavam incorretos.

## ✅ Correções Aplicadas

### Problema

A API Rapidoc exige headers específicos:
- `Accept: application/vnd.rapidoc.tema-v2+json`
- `Content-Type: application/vnd.rapidoc.tema-v2+json`

Mas estávamos enviando:
- `Accept: application/json`
- `Content-Type: application/json` (ou nem tinha)

### Solução

Corrigidos headers em **ambas** as instâncias do axios:

#### 1. `src/lib/rapidoc.ts` (com interceptors)

**Antes:**
```typescript
const mergedHeaders: Record<string, string> = {
  Accept: 'application/json',
};

if (!hasCustomContentType && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
  mergedHeaders['Content-Type'] = 'application/vnd.rapidoc.tema-v2+json';
}
```

**Depois:**
```typescript
const mergedHeaders: Record<string, string> = {
  Accept: 'application/vnd.rapidoc.tema-v2+json',
  'Content-Type': 'application/vnd.rapidoc.tema-v2+json',
};
```

#### 2. `src/lib/rapidocService.ts` (sem interceptors)

**Antes:**
```typescript
const rapidoc = axios.create({
  baseURL: RAPIDOC_BASE_URL,
  timeout: 30000,
});

rapidoc.defaults.headers.common.Accept = 'application/json';
rapidoc.defaults.headers.post['Content-Type'] = 'application/vnd.rapidoc.tema-v2+json';
```

**Depois:**
```typescript
const rapidoc = axios.create({
  baseURL: RAPIDOC_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: 'application/vnd.rapidoc.tema-v2+json',
    'Content-Type': 'application/vnd.rapidoc.tema-v2+json',
  },
});
```

## 🧪 Como Verificar

Após reiniciar o servidor, verifique os logs:

**Antes (ERRADO):**
```
[rapidoc:req:xxxxx] POST ... headers={"Accept":"application/json, text/plain, */*",...}
[rapidoc:err:xxxxx] 415 (26ms) data=
```

**Depois (CORRETO):**
```
[rapidoc:req:xxxxx] POST ... headers={"Accept":"application/vnd.rapidoc.tema-v2+json",...}
[rapidoc:res:xxxxx] 200 (xxxms) size=xxx
```

## 📋 Headers Finais Enviados

Todas as requisições agora incluem:

```
Accept: application/vnd.rapidoc.tema-v2+json
Content-Type: application/vnd.rapidoc.tema-v2+json
Authorization: Bearer <TOKEN>
clientId: <CLIENT_ID>
```

## ✅ Resultado Esperado

Agora o sistema:
1. ✅ Envia headers corretos em TODAS as requisições
2. ✅ Não recebe mais erro 415
3. ✅ Planos carregam corretamente
4. ✅ Beneficiários são criados com sucesso

## 🔄 Após Correção

1. **Reinicie o servidor:** `npm run dev`
2. **Teste novamente:** Acesse `/assinar/{slug}`
3. **Verifique logs:** Confirme que não há mais erro 415
4. **Confirme criação:** Beneficiário deve ser criado com sucesso

## 📚 Referências

- API Rapidoc: Headers obrigatórios para `/tema/api/*`
- Documentação: Todos os endpoints exigem `application/vnd.rapidoc.tema-v2+json`

