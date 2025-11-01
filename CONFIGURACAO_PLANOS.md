# Configuração de Planos - Guia Completo

## 📋 Visão Geral

A plataforma agora suporta o **novo formato da API Rapidoc** que utiliza UUIDs de planos em vez de serviceType. A migração foi feita mantendo **total compatibilidade** com planos existentes.

## 🔄 Sistema Dual (Novo + Antigo)

O sistema funciona com **dois formatos**:

### Formato Antigo (DEPRECATED)
```json
{
  "name": "João Silva",
  "cpf": "12345678900",
  "birthday": "1980-01-01",
  "serviceType": "GS",
  "paymentType": "S"
}
```

### Formato Novo (PREFERENCIAL)
```json
{
  "name": "João Silva",
  "cpf": "12345678900",
  "birthday": "1980-01-01",
  "plans": [
    {
      "paymentType": "S",
      "plan": {
        "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44"
      }
    }
  ]
}
```

## ✅ Como Configurar um Novo Plano

### Passo 1: Obter UUID da Rapidoc

1. Configure o `.env.local` com as credenciais da Rapidoc
2. Inicie o servidor: `npm run dev`
3. Acesse: `http://localhost:3000/api/rapidoc/planos`
4. Copie o UUID do plano desejado

**Exemplo de resposta:**
```json
[
  {
    "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44",
    "name": "Plano Individual",
    "description": "Consultas generalistas e especialistas",
    "serviceType": "GS",
    "values": [...]
  }
]
```

### Passo 2: Cadastrar Plano no Admin

1. Acesse `/admin/planos`
2. Clique em "Cadastrar novo plano"
3. Preencha os campos:

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| Código (serviceType) | ✅ | Ex: GS, GP, GSP (usado para busca) |
| Nome do plano | ✅ | Ex: "Plano Individual" |
| Link de assinatura | ✅ | Gerado automaticamente |
| Descrição | ❌ | Descrição dos serviços |
| Valor padrão | ✅ | Ex: 69,90 |
| Dependentes máximos | ✅ | Ex: 0, 1, 2 |
| **UUID do Plano na Rapidoc** | ❌ | UUID da Rapidoc (NOVO) |

4. Cole o UUID copiado no campo "UUID do Plano na Rapidoc"
5. Clique em "Cadastrar plano"

### Passo 3: Verificar

1. O plano aparece na tabela de "Planos cadastrados"
2. Clique em "Editar" e verifique se o UUID foi salvo
3. Compartilhe a URL de assinatura gerada

## 🔍 Como o Sistema Decide Qual Formato Usar?

### Cenário 1: Plano TEM rapidocUuid configurado
✅ **Sistema usa formato NOVO (`plans`)**  
✅ Beneficiário criado com `plans` array  
✅ Sem campos deprecated

### Cenário 2: Plano NÃO TEM rapidocUuid configurado
✅ **Sistema usa formato ANTIGO (`serviceType`)**  
✅ Beneficiário criado com `serviceType` e `paymentType`  
✅ Compatibilidade total mantida

### Exemplo Prático

**Plano configurado:**
```javascript
{
  id: "GS",
  name: "Generalista e Especialistas",
  rapidocUuid: "6676fb40-4b2f-4434-bd9c-ba6f38925c44"
}
```

**Quando criado beneficiário:**
```json
{
  "name": "Maria",
  "cpf": "12345678900",
  "plans": [
    {
      "paymentType": "S",
      "plan": {
        "uuid": "6676fb40-4b2f-4434-bd9c-ba6f38925c44"
      }
    }
  ]
}
```

## 📍 Fluxos Impactados

### ✅ Checkout de Assinatura (`/assinar/[slug]`)
- Busca plano do Firestore por slug
- Se rapidocUuid → usa formato novo
- Senão → usa formato antigo

### ✅ Webhook Asaas (`/api/asaas/webhook`)
- Processa pagamentos confirmados
- Ativa/desativa beneficiários
- Se rapidocUuid → usa formato novo
- Senão → usa formato antigo

### ✅ Criação de Dependentes (`/api/dependents/create`)
- Herda serviceType do titular
- CORRIGIDO: preenche campos automaticamente

### ✅ Dashboard Assinante
- Exibe especialidades do plano
- Busca de `specialties` ou `plans[].specialties`
- CORRIGIDO: lê ambos os formatos

## 🎯 Migração Gradual

### Estratégia Recomendada

1. **Fase 1: Conviver** (Status Atual)
   - Planos antigos continuam funcionando
   - Novos planos podem usar UUID
   - Zero downtime

2. **Fase 2: Migrar** (Futuro)
   - Atualizar planos existentes com UUIDs
   - Configurar rapidocUuid nos planos principais
   - Testar cada plano

3. **Fase 3: Deprecar** (Futuro)
   - Remover suporte a serviceType
   - Exigir UUID em todos os planos

## 🔧 Script de Teste

```bash
# Ver se planos estão carregando
curl http://localhost:3000/api/rapidoc/planos

# Rodar testes automáticos
node test-rapidoc-endpoints.js
```

## 📊 Monitoramento

### Checklist Pós-Configuração

- [ ] UUID copiado corretamente da Rapidoc
- [ ] Plano cadastrado no Admin
- [ ] URL de assinatura gerada
- [ ] Teste de criação de beneficiário bem-sucedido
- [ ] Especialidades aparecem no dashboard
- [ ] Webhook processando corretamente
- [ ] Dependentes criando sem erro

## 🐛 Troubleshooting

### "UUID não encontrado"
- Verifique se copiou o UUID completo
- Confirme que a Rapidoc está acessível
- Teste: `curl http://localhost:3000/api/rapidoc/planos`

### "Beneficiário não criado"
- Verifique logs do servidor
- Confirme que o UUID é válido na Rapidoc
- Teste com formato antigo primeiro

### "Especialidades não aparecem"
- O dashboard busca em `specialties` ou `plans[].specialties`
- Verifique se a Rapidoc retorna as especialidades
- Teste consultando beneficiário diretamente

## 📚 Arquivos Modificados

### Backend
- ✅ `src/lib/rapidocService.ts` - Tipo RapidocPlanItem, função rapidocPostBeneficiary
- ✅ `src/lib/rapidoc.ts` - Endpoint /tema/api/plans
- ✅ `src/lib/plansStore.ts` - Suporte a rapidocUuid
- ✅ `src/types/plans.ts` - Campo rapidocUuid adicionado
- ✅ `src/app/api/checkout/finalizar/route.ts` - Conversão para plans
- ✅ `src/app/api/asaas/webhook/route.ts` - Conversão para plans
- ✅ `src/app/api/dependents/create/route.ts` - CORRIGIDO Erro 500

### Frontend
- ✅ `src/app/(public)/admin/planos/page.tsx` - Campo UUID no formulário
- ✅ `src/app/(public)/assinante/dashboard/page.tsx` - Leitura de plans

### Documentação
- ✅ `CHANGELOG_API_UPDATES.md` - Changelog completo
- ✅ `TESTE_GUIDE.md` - Guia de testes
- ✅ `START_HERE.md` - Início rápido
- ✅ `CONFIGURACAO_PLANOS.md` - Este arquivo

## 🎉 Pronto para Produção

✅ **Todas as mudanças estão completas e testadas**  
✅ **Zero breaking changes**  
✅ **Compatibilidade total mantida**  
✅ **Sistema dual funcionando**

**Próximo passo:** Configurar UUIDs nos seus planos e testar! 🚀

