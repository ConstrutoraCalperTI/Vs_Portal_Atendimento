# Plano — "Receber chamado" no setor + "Setor do solicitante" no ticket

Status: **aguardando aprovação** · 16/10/2026

## 1. O pedido, em uma frase

Separar os setores em dois papéis:

| Flag **Receber chamado** | Papel do setor | Exemplo hoje |
|---|---|---|
| Marcada | **Atende**: tem fila, agentes, serviços, equipes; ticket pode ser dele | TI, CFTV |
| Desmarcada | **Só solicita**: só serve para identificar de onde vem quem abriu | Financeiro, Comercial, Contratos… |

E todo ticket passa a mostrar o campo **Setor** (do solicitante). Sem vínculo → **"A identificar"**.

## 2. O que existe hoje (analisado)

- `at_setores` não tem nenhum indicador de papel — todo setor é tratado como setor de atendimento.
- `ch_tickets.setor_id` (obrigatório) é o setor **que atende**. Não existe setor **de quem pediu**.
- O solicitante é `at_pessoas` (ligado por e-mail/telefone em `at_pessoa_contatos`). Pessoa **não tem setor**.
- Ticket nasce por 5 caminhos diferentes: agente/intranet (`ch_ticket_criar`), clonar, e-mail, WhatsApp, CalperDESK.
- `usuariosxsetores.XLS`: **256 e-mails distintos em 36 grupos** ("Nome Social"). Só parte dos grupos bate com os setores cadastrados:

| Bate com setor existente | **Sem setor cadastrado** (qtd. pessoas) |
|---|---|
| ADMINISTRATIVO, ARQUITETURA, ASSISTENCIA TECNICA, COBRANÇA, COMERCIAL, COMPLIANCE, CONTABILIDADE / FISCAL, CONTRATOS, Departamento Pessoal→DP, ENGENHARIA, FINANCEIRO, INFRAESTRUTURA, TI | OBRA (77), ORÇAMENTO E PLANEJAMENTO (14), SUPRIMENTOS (14), INCORPORAÇÃO (12), JURIDICO (12), PROJETOS EXECUTIVOS (12), CRC (9), ADMINISTRATIVO DE OBRA (8), INSTALAÇÕES (7), PRESIDENCIA (5), RH (2), ALUMINIO (2), FISCAL (1), ESQUADRIA (1), grupos Arte Wave/Arte Jardim/Arte Design (6), Estagiaria COP (1), sem grupo (10) |

  8 e-mails aparecem em mais de um grupo (precisa regra de desempate).

## 3. Desenho proposto

### Banco (migração só aditiva)

1. `at_setores.recebe_chamados boolean not null default false`.
   Backfill: `true` para setor que **já está em uso como atendimento** (tem ticket, serviço, equipe, atendente, número WhatsApp ou conta de e-mail). Os demais ficam `false`.
2. `at_pessoas.setor_id bigint references at_setores` — o setor **a que a pessoa pertence** (qualquer setor, atende ou não).
3. `ch_tickets.setor_solicitante_id bigint references at_setores` (nulo = "A identificar").
   - **Trigger `before insert`** em `ch_tickets` preenche a partir de `at_pessoas.setor_id` do solicitante → cobre os 5 caminhos de criação sem mexer em cada RPC.
   - Fica **gravado no ticket** (foto do momento da abertura): se a pessoa mudar de setor depois, o histórico não muda.
   - Backfill dos tickets existentes pela pessoa.
4. RPCs:
   - `at_setor_salvar` aceita `recebeChamados`; `at_contexto` devolve o campo.
   - Seletores de **setor que atende** (serviços, equipes, transferir ticket, contas de e-mail, números WhatsApp) passam a listar só `recebe_chamados = true`; o banco recusa ticket em setor que não recebe (`INVALID_INPUT`).
   - Desmarcar a flag de um setor com tickets abertos ou atendentes → **bloqueia com mensagem** ("Setor tem X tickets abertos / Y atendentes").
   - Nova RPC para o agente trocar o **Setor** do solicitante no ticket (com evento no histórico + auditoria).
   - Pessoa: salvar/listar com `setorId`.
5. Importação da planilha: de-para **grupo → setor**, casando por e-mail com `at_pessoa_contatos`; e-mail sem pessoa cria a pessoa (`origem = 'importacao'`).

### Telas

| Tela | Mudança |
|---|---|
| Setores e números (lista) | Nova coluna **Receber chamado** (✓ / —) entre Atendentes e Situação |
| Setores e números (formulário) | Novo switch **Receber chamado** — "Desmarcado: o setor só identifica solicitantes; não tem fila nem recebe tickets" |
| Ticket (painel lateral) | Campo **Setor** (do solicitante), editável pelo agente; vazio mostra **A identificar** |
| Lista de tickets | Coluna opcional **Setor do solicitante** + filtro (inclui "A identificar") |
| Pessoas (cadastro) | Campo **Setor** |

## 4. Fases (checklist binário)

**F1 — Banco**
- [ ] Migração `recebe_chamados` + backfill por uso
- [ ] `at_pessoas.setor_id` + `ch_tickets.setor_solicitante_id` + índices
- [ ] Trigger de preenchimento na criação do ticket + backfill
- [ ] RPCs: setor salvar/contexto, seletores filtrados, trava de desmarcar, trocar setor no ticket, pessoa com setor
- [ ] Aplicar no Supabase e conferir com consultas

**F2 — Setores e números**
- [ ] Coluna "Receber chamado" na tabela
- [ ] Switch no formulário + mensagens de bloqueio

**F3 — Ticket**
- [ ] Campo "Setor" no ticket com "A identificar"
- [ ] Coluna e filtro na lista de tickets
- [ ] Campo "Setor" no cadastro de Pessoas

**F4 — Carga da planilha**
- [ ] De-para grupo → setor aprovado
- [ ] Importação executada + relatório (vinculados / criados / sem setor / conflitos)

**F5 — Validação**
- [ ] Abrir ticket pelos 5 canais e conferir o Setor
- [ ] `tsc` + build sem erro

## 5. Decisões que preciso de você

1. **Grupos da planilha sem setor** (OBRA, JURIDICO, SUPRIMENTOS, INCORPORAÇÃO, CRC, RH, PRESIDENCIA…):
   a) criar como setores novos **só solicitantes** (recomendado), b) agrupar num setor existente, ou c) deixar "A identificar".
2. **Grupos parecidos**: FISCAL → "Contabilidade / Fiscal"? ADMINISTRATIVO DE OBRA → "Administrativo" ou setor próprio? Arte Wave/Jardim/Design → "Engenharia"?
3. **E-mail em dois grupos** (8 casos): usar o primeiro, ou listar para você decidir?
4. **Backfill da flag**: confirma "marca só os setores já em uso como atendimento" (deve ficar TI e CFTV, e o que mais tiver serviço/ticket)?
5. Quando o agente trocar o Setor no ticket, **atualiza também o cadastro da pessoa**? (Recomendo: pergunta na hora — "aplicar também ao cadastro?")
6. Aproveito para corrigir os nomes **"Complience" → "Compliance"** e **"Relecionamento" → "Relacionamento"**?
