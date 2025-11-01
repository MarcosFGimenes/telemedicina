# 🎨 Seletor Visual de Planos da Rapidoc

## 📋 Resumo

Implementação de um seletor visual e intuitivo para escolher planos da Rapidoc diretamente na tela de gerenciamento de planos (`/admin/planos`).

## ✨ Funcionalidades

### 1. **Busca Automática de Planos**
- Ao carregar a página, busca automaticamente os planos disponíveis da Rapidoc
- Endpoint utilizado: `GET /api/rapidoc/planos` → `GET /tema/api/plans`
- Fallback automático caso a Rapidoc esteja indisponível

### 2. **Seletor Visual**
- Dropdown estilizado com todos os planos disponíveis
- Exibe nome e descrição de cada plano
- Carregamento assíncrono sem bloquear a interface

### 3. **Visualização de Especialidades**
Quando um plano é selecionado, exibe:
- ✅ Nome do plano
- ✅ Descrição completa
- ✅ UUID do plano
- ✅ **Todas as especialidades incluídas** (em badges visuais)
- ✅ Contador de especialidades

### 4. **Campo Manual Alternativo**
- Mantém a possibilidade de digitar o UUID manualmente
- Útil caso a Rapidoc esteja offline ou para testes

## 🎯 Como Usar

### Na Tela `/admin/planos`:

1. **Editar ou Criar Plano:**
   - Clique em "Editar" ou preencha os campos do formulário

2. **Selecionar Plano da Rapidoc:**
   - Role até "Plano na Rapidoc (opcional)"
   - Selecione um plano no dropdown
   - Visualize as especialidades automaticamente

3. **Confirmar:**
   - As especialidades são exibidas em badges verdes
   - O UUID é preenchido automaticamente
   - Clique em "Cadastrar plano" ou "Salvar alterações"

## 🖼️ Interface Visual

```
┌─────────────────────────────────────────────────────────────┐
│ Plano na Rapidoc (opcional)                                 │
├─────────────────────────────────────────────────────────────┤
│ [Selecione um plano da Rapidoc...        ▼]                │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Premium                                                 │ │
│ │ Plano Premium (Generalista 24/7 + Especialidades)      │ │
│ │ UUID: 6676fb40-4b2f-4434-bd9c-ba6f38925c44             │ │
│ ├────────────────────────────────────────────────────────┤ │
│ │ Especialidades incluídas (9):                          │ │
│ │                                                         │ │
│ │  [Urologia]  [Ginecologia e Obstetrícia]  [Pediatria] │ │
│ │  [Ortopedia]  [Neurologia]  [Nutrição]                 │ │
│ │  [Dermatologia]  [Endocrinologia]  [Psiquiatria]       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Ou digite o UUID manualmente...]                           │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Implementação Técnica

### Arquivos Modificados

1. **`src/lib/rapidocService.ts`**
   - Adicionados types: `RapidocSpecialty` e `RapidocPlan`
   - Type `RapidocPlan` inclui array de especialidades

2. **`src/app/(public)/admin/planos/page.tsx`**
   - Novo state: `rapidocPlans` e `rapidocPlansLoading`
   - Nova função: `loadRapidocPlans()`
   - Componente visual de seleção com especialidades
   - Campo manual alternativo

### Tipos TypeScript

```typescript
export type RapidocSpecialty = {
  name: string;
  uuid: string;
};

export type RapidocPlan = {
  uuid: string;
  name: string;
  description: string;
  isActive: boolean;
  serviceType: string;
  specialties: RapidocSpecialty[];
};
```

### Estados da Interface

- **Carregando:** Exibe mensagem "Carregando planos da Rapidoc..."
- **Vazio:** Mensagem informando que não há planos disponíveis
- **Com dados:** Dropdown funcional + visualização de especialidades
- **Selecionado:** Exibe card com informações detalhadas

## ✅ Benefícios

1. **Intuitivo:** Não precisa decorar UUIDs
2. **Informativo:** Visualiza todas as especialidades de cada plano
3. **Verificável:** Confirma se está selecionando o plano correto
4. **Robusto:** Fallback automático em caso de falha
5. **Flexível:** Permite entrada manual quando necessário

## 🧪 Testes

### Cenários Testados

✅ Carregamento de planos da Rapidoc  
✅ Dropdown preenchido corretamente  
✅ Seleção de plano exibe especialidades  
✅ Contagem de especialidades correta  
✅ Visualização de badges estilizados  
✅ Campo manual sincronizado  
✅ Fallback quando Rapidoc offline  
✅ Loading state exibido  

### Como Testar

1. Acesse `/admin/planos`
2. Clique em "Editar" em um plano existente
3. Verifique se o dropdown carrega os planos
4. Selecione um plano diferente
5. Confirme que as especialidades são exibidas
6. Salve e verifique se o UUID foi atualizado corretamente

## 📱 Responsivo

- Layout adapta-se a telas pequenas e grandes
- Badges quebram linha automaticamente
- Dropdown ocupa 100% da largura
- Spacing consistente em todos os tamanhos

## 🔄 Próximas Melhorias Possíveis

- [ ] Filtro de busca no dropdown
- [ ] Comparação lado a lado de planos
- [ ] Pré-visualização de valores (se disponíveis)
- [ ] Cache de planos para performance
- [ ] Sincronização bidirecional com Firestore

## 📚 Referências

- Endpoint Rapidoc: `GET /tema/api/plans`
- Documentação: `CHANGELOG_API_UPDATES.md`
- Configuração: `CONFIGURACAO_PLANOS.md`

