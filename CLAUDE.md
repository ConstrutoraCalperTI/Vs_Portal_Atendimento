# Portal Atendimento (Portal de Tickets da Calper)

React 19 + Vite + TypeScript, Supabase (schema `portal_atendimento`, projeto compartilhado da Calper). Menu, rotas e permissões
saem de `src/config/menuRegistry.ts`. Tokens visuais em `src/index.css`. Migrations só aditivas em `supabase/migrations/`.
Verificação: `npm run lint`, `npm run build` (typecheck), `npm test` e `npm run test:db`.

## Módulo Solicitações Financeiras

Antes de qualquer alteração neste módulo, leia docs/Solicitacoes-financeiras/CONTEXTO.md. Quando uma regra, estado, tabela ou componente mudar, atualize o CONTEXTO.md no mesmo commit.
