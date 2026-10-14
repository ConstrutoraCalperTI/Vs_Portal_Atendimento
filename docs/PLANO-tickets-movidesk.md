# Plano — Gestão Tickets Movidesk

Mockup: `docs/mockups/tickets-movidesk.html`. Decisões D1 a D7 aprovadas pelo Wagner em 14/10/2026 (todas "sim").
Comportamento medido da API: Cerebro `movidesk-api-tickets-comportamento-real`.

## Decisões aprovadas
| | Decisão |
|---|---|
| D1 | Sincroniza **toda** a base (todas as equipes). Menu Tickets só para Admin e Super admin no início, por causa do dado pessoal. |
| D2 | Incremental por chave: `lastUpdate ge {desde} and id gt {último id}`, sem `$skip`. Cada rodada começa no `lastUpdate` da anterior menos 5 min; upsert pelo `id`. |
| D3 | Ticket em colunas; ações em tabela própria (texto sem HTML); históricos de status e responsável em tabelas próprias. **Revista em 14/10/2026 (pedido do Wagner): os anexos também são importados** (ver Anexos). |
| D4 | 1 página (100 tickets) por rodada (até 3 configurável; não começa outra depois de 60 s). pg_cron chama a cada minuto; a Edge decide pela agenda; trava contra rodada dupla. |
| D5 | Palavra-chave por índice de texto (tsvector português, sem acento) sobre assunto e ações. |
| D6 | Só leitura. Separado de `ch_tickets`. Nada é escrito no Movidesk. |
| D7 | Grupo novo **Gestão Tickets Movidesk** › **Tickets** logo depois de Gestão de Chamados; **Integrações › Movidesk** com Conexão, Rotas, Sincronização e Execuções. |

## Modelo (migration aditiva, schema `portal_atendimento`, prefixo `md_`)
- `md_config` (linha única): `token_segredo_id` (Vault `portal_atendimento_movidesk_token`), `select`, `expand`,
  agenda (`ativo`, `janela_inicio`, `janela_fim`, `recorrencia_min`, `dias int[]`, `paginas_por_rodada`, `incremental_dia_todo`),
  estado (`etapa` past → recentes → incremental, `cursor_past_id`, `cursor_recentes_id`, `incremental_desde`, `incremental_cursor_id`,
  `travado_ate`, `ultima_rodada_em`, `proxima_rodada_em`).
- `md_tickets`: os 44 campos do `$select` em colunas tipadas (datas `timestamptz` lidas como UTC), `owner_id/nome`,
  `created_by_id/nome`, `clientes jsonb`, `campos_adicionais jsonb`, `busca tsvector`, `sincronizado_em`.
- `md_ticket_acoes` (`ticket_id`, `acao_id`): tipo, origem, status, texto, criado em/por, `anexos jsonb` (nome, link, tamanho).
- `md_ticket_status_hist`, `md_ticket_responsavel_hist`.
- `md_execucoes`: quando, etapa, filtro usado, tickets, ms, KB, HTTP, erro.
- `md_origens` (código → nome), editável (23 e 26 a confirmar).
- Índices: `busca` (GIN), `created_date`, `last_update`, `owner_id`, `owner_team`, `base_status`, serviço.
- RPCs `security definer` com checagem de permissão: `md_tickets_lista(filtros jsonb, pagina int)`, `md_ticket_detalhe(id)`,
  `md_filtros_opcoes()`, `md_config_ler()`, `md_config_salvar(...)`, `md_salvar_token(text)`, `md_execucoes(...)`,
  `md_recomecar(etapa)`; e, só para service role, `md_ler_credencial()`, `md_upsert_pagina(jsonb)` e `md_travar()/md_destravar()`.
- Permissões novas: `movidesk_tickets` (ver) e `movidesk_integracao` (configurar), concedidas a admin e super_admin.

## Edge Function `portal_atendimento-movidesk`
- `testar`: chama as 3 rotas com `$top=1` e devolve HTTP e tempo de cada uma.
- `rodada` (pg_cron, service role): confere janela, dias e recorrência; trava; busca 1 página da etapa; `md_upsert_pagina`;
  avança o cursor; troca de etapa quando a página vem com menos de 100; grava `md_execucoes`; destrava. Responde na hora
  e termina com `EdgeRuntime.waitUntil`.
- `sincronizar_agora` (botão): mesma rodada fora da agenda, respeitando a trava.
- Token: recorta o GUID com regex (o valor colado da URL costuma trazer `&$`).
- Mapeamento puro em `_shared/movidesk/mapear.ts` (UTC sem "Z", serviço Third › Second › First, texto das ações sem HTML), com testes Vitest.

## Ordem das etapas (mudança na implementação)
**Recentes (/tickets) → past (/tickets/past) → incremental.** O plano original começava pelo histórico. Mas um ticket que
passa dos 90 dias durante a carga (~15 h) sairia de /tickets depois de /past já ter passado por ele. Nesta ordem ele é pego
em /past. O incremental começa no início da carga menos 5 min.

## Anexos (pedido do Wagner, 14/10/2026)
- Download testado: `GET /storage/download?token=…&id=<path>` → 302 para `calper.movidesk.com` → arquivo (0,8 a 2,5 s).
- Cada ação gravada põe os anexos na fila `md_anexos` (gatilho, único pelo caminho). A mesma rodada do pg_cron baixa os
  pendentes em paralelo (4 de cada vez, até 80 s) e grava no bucket privado `movidesk-anexos`
  (`movidesk/<ticket>/<ação>/<id>-<nome>`). 3 tentativas (30 min entre elas); acima do limite (até 50 MB) vira "grande".
- Leitura: política do Storage só para Admin e Super admin; o detalhe do ticket abre por URL assinada de 1 min.
- **Medido na carga real (300 tickets):** ~2,3 anexos por ticket, ~1 MB cada → **~250 GB** na base inteira (100–130 mil tickets).

## Fases (checklist binário)
### F1 · Banco
- [x] Migrations `20261014100000` (tickets), `…110000` (anexos) e `…120000` (privilégio de md_sem_acento), aditivas
- [x] Ensaio com rollback no Supabase; 13 testes de banco (`tests/db/movidesk.db.test.ts`) + suíte toda (65)
- [x] Aplicadas, registradas em schema_migrations e tipos gerados
### F2 · Edge Function
- [x] `_shared/movidesk/movidesk.ts` (mapeador e cliente) + 11 testes (`tests/movidesk.test.ts`)
- [x] `portal_atendimento-movidesk` publicada (rodada, sincronizar_agora, testar)
- [x] Rodada real pelo pg_cron: 3 páginas (44 a 60 s cada), 300 tickets, 1.350 ações, 492 anexos (470 MB), 0 erros
### F3 · Integrações › Movidesk
- [x] Conexão (token no cofre, testar), Campos, Rotas, Sincronização (agenda, etapas, estimativa, anexos), Execuções
- [x] Seção `integracao_movidesk` (só Super admin)
### F4 · Gestão Tickets Movidesk › Tickets
- [x] Grupo `gestao_movidesk` e seção `gestao_movidesk_tickets` (só Admin e Super admin)
- [x] Lista com os 9 filtros, 100 por página, status e SLA
- [x] Gaveta de detalhe com ações, históricos e anexos (sem o botão "Abrir no Movidesk", pedido do Wagner)
### F5 · Carga
- [ ] Agenda ligada — **pausada** depois do teste, esperando a decisão sobre os ~250 GB de anexos
- [ ] Carga histórica concluída e troca automática para o incremental
### F6 · Verificação
- [x] tsc, oxlint, Vitest (174) e build
- [x] E2E no Edge (modo simulado): filtros, teclado, gaveta, token, testar, agenda, 1100/390 px sem rolagem, operador barrado, console limpo
- [ ] Tela no modo real (precisa do login do Wagner)