# Plano de ação: Conversas do WhatsApp na Gestão de Chamados + OpenWA (opção A) + e-mail só domínio

Mockup aprovado pelo Wagner em 09/10/2026: [docs/mockups/conversas-chamados.html](mockups/conversas-chamados.html).
Decisões no Cerebro: `vs-portal-atendimento-gestao-atendimento-plano` (rodadas de 09/10/2026).

## 1. Pedido (como entendi)

- **Conversas e Monitor dentro da Gestão de Chamados.** O atendente usa um menu só: tickets e WhatsApp ao vivo.
- **Cada atendimento por WhatsApp vira ticket.**
  - O ticket abre quando a conversa entra na fila.
  - A IA classifica o ticket pela triagem existente.
  - Ao encerrar, o sistema pergunta "Foi resolvido?":
    - **Sim:** o ticket vai para Resolvido, com a solução resumida pela IA e revisada pelo atendente.
    - **Não:** o ticket vai para "Em atendimento".
  - Encerramento por inatividade: o ticket vai para "Em atendimento".
- **Identificação do colaborador pelo número,** com confirmação de nome e e-mail só no primeiro contato.
  - Número sem cadastro: pede nome e e-mail @calper.com.br.
  - Setor que exige linha corporativa: número fora da lista recebe um aviso e não abre ticket.
- **OpenWA, opção A,** com o mesmo motor da Zenvia, que continua funcionando:
  - o colaborador fala no privado com o número do sistema do setor;
  - cada pedido é repassado a um **grupo interno só de atendentes**;
  - o atendente responde **citando** o pedido, no celular ou no sistema, e a resposta chega ao privado do colaborador.
- **E-mail só domínio:** TI, Administrativo e CFTV abrem ticket só para remetentes @calper.com.br.
- **Métrica "Quem mais abre chamados"** na Visão geral.

## 2. Desenho

**Banco (regras e estado, atômico):** uma conversa ativa por `(número, telefone)`, como hoje.

1. `at_whatsapp_receber(p)` é a entrada única, chamada pelo webhook da Zenvia e pelo do OpenWA, com service role:
   - grava a mensagem;
   - roda a identificação no modo `robo`;
   - entra na fila;
   - cria ou continua o ticket;
   - grava a mensagem também como ação do ticket;
   - enfileira o repasse para o grupo interno.
2. As respostas automáticas e as mensagens do atendente ficam em `at_mensagens` com `status = 'pendente'`. Os repasses ao grupo ficam em `at_repasses`, também pendentes.
3. As ações do atendente vêm de `at_conversa_acao(conversa, p)`, uma RPC com o JWT de quem chama, como as RPCs `ch_*`:
   - assumir, devolver, transferir, enviar e encerrar (encerrar recebe `{resolvido, solucao, servicoId, categoriaId}`);
   - ao assumir, o ticket ganha responsável e vai para "Em atendimento".
4. **Ação pública no ticket de WhatsApp,** feita pela tela do ticket: um gatilho cria a mensagem pendente na conversa. O status de envio volta para a ação do ticket.
5. `at_whatsapp_ciclo()` roda pelo pg_cron, a cada 1 min:
   - roleta da fila e aviso fora do horário;
   - atendente sem resposta → volta à fila;
   - cliente sem resposta por N horas → encerra (ticket "Em atendimento");
   - identificação parada há 10 min → fila sem identificação.

**Edge Functions (só entrada e saída):**

- `portal_atendimento-whatsapp`:
  - `despachar`: envia as pendentes pela Zenvia ou pelo OpenWA, conforme o canal do número;
  - `ciclo`: cron, `at_whatsapp_ciclo` + despachar;
  - administração do OpenWA: testar, QR, grupos e membros.
- `portal_atendimento-openwa-webhook`, novo:
  - confere o HMAC (`X-OpenWA-Signature`);
  - mensagem privada → `at_whatsapp_receber`;
  - mensagem do grupo interno → `at_grupo_receber` (resposta citando um repasse).
- `portal_atendimento-zenvia-webhook`: passa a chamar `at_whatsapp_receber` e despachar.
- `portal_atendimento-ia`: ação nova `resumir`, a solução sugerida para o diálogo de encerramento.

**Front:**
- "Central de atendimento" vira **Conversas** e **Monitor de atendimento** dentro de Gestão de Chamados. O caminho antigo redireciona para o novo.
- Diálogo de encerramento "Foi resolvido?".
- Painel "Conversa ao vivo" no ticket.
- Tela **WhatsApp OpenWA** em Administração.
- Opção "Só domínio" na conta de e-mail.
- Bloco "Quem mais abre chamados" na Visão geral.

## 3. Fases (checklist binário)

### Fase 1: e-mail só domínio
- [ ] Migration: `abrir_tickets` aceita `dominio` e a conta ganha a coluna `dominios_permitidos` (padrão `{calper.com.br}`); `ch_email_processar` passa a recusar remetentes de fora.
- [ ] Tela Central Email: opção "Só domínio" com a lista de domínios.

### Fase 2: motor do chat (Zenvia e OpenWA)
- [ ] Migration: `at_numeros.canal` (`zenvia`/`openwa`), `openwa_sessao` e `grupo_interno`; `at_atendentes.whatsapp`; regras por setor (`wa_identificar`, `wa_so_corporativo`, `msg_nao_corporativo`); `at_linhas`; `at_repasses`; `at_atendimentos.ticket_id`; `at_conversas.ident`.
- [ ] `at_whatsapp_receber`: identificação, fila, ticket, ações do ticket e repasse.
- [ ] `at_conversa_acao`: assumir, devolver, transferir, enviar e encerrar (resolvido ou não).
- [ ] Ação pública no ticket de WhatsApp vira mensagem pendente, e o status volta para a ação.
- [ ] `at_whatsapp_ciclo`: roleta, fora do horário, inatividade e identificação parada; pg_cron a cada 1 min.
- [ ] Edge `portal_atendimento-whatsapp`: despachar (Zenvia e OpenWA) e ciclo.
- [ ] Zenvia webhook processando as mensagens de entrada.
- [ ] Central: ações chamando a RPC e despachando na hora.

### Fase 3: OpenWA
- [ ] Credenciais no Vault: URL base, API key e segredo do webhook (só super admin).
- [ ] Edge `portal_atendimento-openwa-webhook`: HMAC, privado → receber, grupo interno → resposta citando.
- [ ] `at_grupo_receber`: identifica o atendente pelo número e manda a resposta ao colaborador como "Nome (Setor): …". Sem citação, uma dica a cada 30 min.
- [ ] Tela WhatsApp OpenWA:
  - conexão e teste;
  - sessão com QR;
  - número → canal, sessão e grupo interno;
  - regras por setor;
  - WhatsApp dos atendentes e membros do grupo;
  - linhas corporativas, com importação de planilha.

### Fase 4: telas na Gestão de Chamados
- [ ] Conversas e Monitor de atendimento como seções da Gestão de Chamados; redirecionamento do caminho antigo.
- [ ] Diálogo de encerramento "Foi resolvido?", com a solução sugerida pela IA (`resumir`) e serviço e categoria.
- [ ] Painel "Conversa ao vivo" na tela do ticket de WhatsApp.

### Fase 5: métrica
- [ ] RPC `ch_top_solicitantes(dias)` e bloco "Quem mais abre chamados" na Visão geral.

### Fase 6: verificação
- [ ] `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` sem erro.
- [ ] Testes Vitest das partes puras: leitura do webhook OpenWA, HMAC e formatação dos repasses.
- [ ] Migrations ensaiadas (local ou com rollback) — **depende de acesso ao banco**.
- [ ] Migrations aplicadas e Edge Functions publicadas — **Wagner** (`npx supabase db push`, `functions deploy`).
- [ ] OpenWA no ar com túnel, sessão pareada e webhook cadastrado — **Wagner**.

## 4. Configuração do OpenWA (Wagner, na validação)

1. **Subir o OpenWA** na sua máquina com `npm run dev` ou Docker. No `.env`:
   - `RESOLVE_LID_TO_PHONE=true`, porque sem isso remetentes `@lid` chegam sem o número;
   - `SSRF_ALLOWED_HOSTS` não é preciso: o webhook vai para o Supabase, que é público.
2. **Abrir o túnel:** `cloudflared tunnel --url http://localhost:2785`. A URL `https://….trycloudflare.com` vai na tela WhatsApp OpenWA.
3. **Criar a sessão e parear** com o chip do sistema do setor, pelo QR da tela.
4. **Criar o grupo interno** "Atendimento TI · interno" com o número do sistema e os atendentes, e escolhê-lo na tela.
5. **Cadastrar o WhatsApp de cada atendente** e as linhas corporativas (planilha da operadora).

## 5. Riscos
- O OpenWA não é a API oficial, então o número pode ser bloqueado. Volume baixo, só conversas de suporte.
- O túnel temporário muda de URL a cada vez que reinicia, e é preciso atualizar a tela. Na Hostinger, a URL fica fixa.
- Na Zenvia, depois de 24 h sem mensagem do cliente, a Meta só aceita modelo aprovado, e o envio falha com o motivo.
