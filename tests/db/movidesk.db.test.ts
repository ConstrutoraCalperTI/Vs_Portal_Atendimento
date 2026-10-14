// Gestão Tickets Movidesk (migration 20261014100000, docs/PLANO-tickets-movidesk.md) contra um Postgres real com todas as
// migrations: quem vê (Admin e Super admin), quem configura (Super admin), token no cofre, agenda, trava, upsert da página,
// busca sem acento e a ordem das etapas recentes → past → incremental.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, startTestDb, type TestDb } from "./pgHarness";

let db: TestDb;
let svc: pg.Client;
let superAdmin: string;
let admin: string;
let operador: string;

const sessoes = new Map<string, string>();
const claims = (user: string) => ({ role: "authenticated", sub: user, session_id: sessoes.get(user), amr: [{ method: "recovery", timestamp: 1 }] });

async function usuario(email: string, perfil: string): Promise<string> {
  const { rows } = await db.admin.query("insert into auth.users (email) values ($1) returning id", [email]);
  await db.admin.query("insert into portal_atendimento.usuarios (id, email, nome, perfil_key, status) values ($1, $2, $3, $4, 'active')", [rows[0].id, email, `Teste ${perfil}`, perfil]);
  const sid = (await db.admin.query("insert into auth.sessions (user_id) values ($1) returning id", [rows[0].id])).rows[0].id as string;
  sessoes.set(rows[0].id, sid);
  return rows[0].id as string;
}

/** Erro de RPC: código em `detail` (portal_atendimento.erro). */
async function codigoErro(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    const err = e as { detail?: string; code?: string };
    return err.detail || err.code || "ERRO";
  }
}

const pagina = {
  tickets: [
    {
      id: 188002, protocolo: null, tipo: 2, assunto: "Boleto vencido", status: "Resolvido", status_base: "Resolved", origem: 3,
      criado_em: "2026-10-05T19:29:38Z", equipe: "CRC", servico: "FINANCEIRO › BOLETO › 2ª VIA", responsavel: "Débora Braga",
      atualizado_movidesk: "2026-10-13T13:15:27Z", qtd_acoes: 1, clientes: [], campos_adicionais: [],
    },
    {
      id: 188081, protocolo: null, tipo: 2, assunto: "Solicitação de cadastro", status: "Aguardando", status_base: "Stopped", origem: 99,
      criado_em: "2026-10-06T11:36:39Z", equipe: "CRC", servico: "Relacionamento com Clientes", responsavel: "Monique Santos Silva",
      atualizado_movidesk: "2026-10-14T14:51:38Z", qtd_acoes: 2, sla_solucao_pausado: true,
    },
  ],
  acoes: [
    { ticket_id: 188002, acao_id: 1, tipo: 2, texto: "Segue a segunda via do boleto atualizada", criado_em: "2026-10-05T19:29:38Z", criado_por: "Cliente", anexos: [] },
    { ticket_id: 188081, acao_id: 1, tipo: 2, texto: "Preciso da escritura e da certidão negativa", criado_em: "2026-10-06T11:36:39Z", criado_por: "Cliente", anexos: [{ nome: "doc.pdf", link: "https://x" }] },
    { ticket_id: 188081, acao_id: 2, tipo: 1, texto: "Nota interna", criado_em: "2026-10-07T11:00:00Z", criado_por: "Agente", anexos: [] },
  ],
  statusHist: [{ ticket_id: 188081, seq: 1, status: "Novo", alterado_em: "2026-10-06T11:36:39Z", alterado_por: "Sistema" }],
  responsavelHist: [{ ticket_id: 188081, seq: 1, responsavel: "Monique Santos Silva", equipe: "CRC", alterado_em: "2026-10-06T12:00:00Z" }],
};

beforeAll(async () => {
  db = await startTestDb(54414);
  svc = await db.connect();
  await svc.query("set role service_role");
  superAdmin = await usuario("super.md@calper.com.br", "super_admin");
  admin = await usuario("admin.md@calper.com.br", "admin");
  operador = await usuario("oper.md@calper.com.br", "operador");
});

afterAll(async () => {
  await svc?.end().catch(() => {});
  await db?.stop();
});

describe("acesso", () => {
  it("Admin vê a lista; operador é barrado; anônimo nem executa", async () => {
    const r = await asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_tickets_lista('{}') as r"));
    expect(r.rows[0].r).toMatchObject({ total: 0, pagina: 1, porPagina: 100, tickets: [] });
    expect(await codigoErro(asUser(db.admin, claims(operador), (c) => c.query("select portal_atendimento.md_tickets_lista('{}')")))).toBe("FORBIDDEN");
    expect(await codigoErro(asUser(db.admin, { role: "anon" }, (c) => c.query("select portal_atendimento.md_tickets_lista('{}')")))).toBe("42501");
  });

  it("só o Super admin configura; ninguém logado chama as funções da rodada nem lê as tabelas", async () => {
    expect(await codigoErro(asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_config_ler()")))).toBe("FORBIDDEN");
    expect(await codigoErro(asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_token_salvar('x')")))).toBe("FORBIDDEN");
    expect(await codigoErro(asUser(db.admin, claims(superAdmin), (c) => c.query("select portal_atendimento.md_upsert_pagina('{}')")))).toBe("42501");
    expect(await codigoErro(asUser(db.admin, claims(superAdmin), (c) => c.query("select portal_atendimento.md_ler_credencial()")))).toBe("42501");
    expect(await codigoErro(asUser(db.admin, claims(superAdmin), (c) => c.query("select * from portal_atendimento.md_tickets")))).toBe("42501");
  });
});

describe("token e configuração", () => {
  it("recorta o GUID do valor colado da URL e guarda no cofre", async () => {
    const guid = "1a2b3c4d-0000-4000-8000-00000000abcd";
    expect(await codigoErro(asUser(db.admin, claims(superAdmin), (c) => c.query("select portal_atendimento.md_token_salvar('nao-e-token')")))).toBe("INVALID_INPUT");
    await db.admin.query("begin");
    await db.admin.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims(superAdmin))]);
    await db.admin.query("set local role authenticated");
    const r = await db.admin.query("select portal_atendimento.md_token_salvar($1) as f", [`${guid.toUpperCase()}&$`]);
    await db.admin.query("commit");
    expect(r.rows[0].f).toBe("abcd");
    const cred = await svc.query("select portal_atendimento.md_ler_credencial() as c");
    expect(cred.rows[0].c.token).toBe(guid);
  });

  it("valida a agenda", async () => {
    const base = { ativo: true, janelaInicio: "19:00", janelaFim: "07:00", dias: [0, 1, 2, 3, 4, 5, 6], recorrenciaMin: 1, paginasPorRodada: 1, incrementalDiaTodo: true, incrementalRecorrenciaMin: 10, select: "id,subject", expand: "" };
    const salvar = (p: object) => asUser(db.admin, claims(superAdmin), (c) => c.query("select portal_atendimento.md_config_salvar($1)", [JSON.stringify(p)]));
    expect(await codigoErro(salvar({ ...base, dias: [] }))).toBe("INVALID_INPUT");
    expect(await codigoErro(salvar({ ...base, janelaFim: "19:00" }))).toBe("INVALID_INPUT");
    expect(await codigoErro(salvar({ ...base, paginasPorRodada: 5 }))).toBe("INVALID_INPUT");
    expect(await codigoErro(salvar(base))).toBe("OK");
  });

  it("janela que passa da meia-noite vale para o dia em que abriu", async () => {
    const agenda = (hora: string, dias: number[]) =>
      db.admin.query(
        `select portal_atendimento.md_na_agenda(jsonb_populate_record(null::portal_atendimento.md_config, $2::jsonb), $1::timestamptz) as ok`,
        [hora, JSON.stringify({ id: true, ativo: true, janela_inicio: "19:00", janela_fim: "07:00", dias, recorrencia_min: 1, etapa: "recentes" })],
      );
    // 13/10/2026 é terça (dow 2). 02:00 de terça (SP) pertence à janela aberta na segunda (dow 1).
    expect((await agenda("2026-10-13T02:00:00-03:00", [1])).rows[0].ok).toBe(true);
    expect((await agenda("2026-10-13T02:00:00-03:00", [2])).rows[0].ok).toBe(false);
    expect((await agenda("2026-10-13T20:00:00-03:00", [2])).rows[0].ok).toBe(true);
    expect((await agenda("2026-10-13T12:00:00-03:00", [0, 1, 2, 3, 4, 5, 6])).rows[0].ok).toBe(false);
  });
});

describe("rodada", () => {
  it("trava, grava a página, avança o cursor e segue recentes → past → incremental", async () => {
    const r1 = (await svc.query("select portal_atendimento.md_rodada_iniciar('manual') as r")).rows[0].r;
    expect(r1).toMatchObject({ etapa: "recentes", rota: "tickets", filtro: "id gt 0", paginas: 1 });
    // Travado: outra chamada não roda.
    expect((await svc.query("select portal_atendimento.md_rodada_iniciar('manual') as r")).rows[0].r).toBeNull();

    expect((await svc.query("select portal_atendimento.md_upsert_pagina($1) as n", [JSON.stringify(pagina)])).rows[0].n).toBe(2);
    // Gravar a mesma página de novo não duplica.
    expect((await svc.query("select portal_atendimento.md_upsert_pagina($1) as n", [JSON.stringify(pagina)])).rows[0].n).toBe(2);
    expect((await svc.query("select count(*)::int n from portal_atendimento.md_ticket_acoes")).rows[0].n).toBe(3);

    const conclui = (p: object) => svc.query("select portal_atendimento.md_rodada_concluir($1) as r", [JSON.stringify({ origem: "manual", ms: 1000, kb: 10, http: 200, ultima: true, ...p })]);
    // Página cheia: continua na etapa, com o cursor no maior id.
    expect((await conclui({ etapa: "recentes", filtro: "id gt 0", qtd: 100, ultimoId: 188081 })).rows[0].r).toMatchObject({ etapa: "recentes", filtro: "id gt 188081" });
    // Página incompleta: passa para o histórico antigo.
    expect((await conclui({ etapa: "recentes", filtro: "id gt 188081", qtd: 7, ultimoId: 189000 })).rows[0].r).toMatchObject({ etapa: "past", rota: "tickets/past", filtro: "id gt 0" });
    // Erro não avança e solta a trava.
    expect((await conclui({ etapa: "past", filtro: "id gt 0", qtd: 0, http: 500, erro: "HTTP 500" })).rows[0].r).toMatchObject({ etapa: "past", filtro: "id gt 0" });
    expect((await svc.query("select travado_ate from portal_atendimento.md_config")).rows[0].travado_ate).toBeNull();
    // Fim do histórico: incremental desde o início da carga menos 5 min.
    const r = (await conclui({ etapa: "past", filtro: "id gt 0", qtd: 40, ultimoId: 500 })).rows[0].r;
    expect(r.etapa).toBe("incremental");
    expect(r.filtro).toMatch(/^lastUpdate ge \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.00z and id gt 0$/);
    const cfg = (await svc.query("select carga_concluida_em is not null as fim, incremental_desde = carga_iniciada_em - interval '5 minutes' as desde from portal_atendimento.md_config")).rows[0];
    expect(cfg).toEqual({ fim: true, desde: true });

    // Incremental: página cheia anda o cursor; ao terminar, recomeça do maior lastUpdate visto menos 5 min.
    await conclui({ etapa: "incremental", qtd: 100, ultimoId: 900, maiorUpdate: "2030-01-01T10:00:00Z" });
    expect((await svc.query("select incremental_cursor_id from portal_atendimento.md_config")).rows[0].incremental_cursor_id).toBe("900");
    const fim = (await conclui({ etapa: "incremental", qtd: 3, ultimoId: 950, maiorUpdate: "2030-01-01T09:00:00Z" })).rows[0].r;
    expect(fim.filtro).toBe("lastUpdate ge 2030-01-01T09:55:00.00z and id gt 0");

    const execs = await asUser(db.admin, claims(superAdmin), (c) => c.query("select jsonb_array_length(portal_atendimento.md_execucoes_lista(false)) n, jsonb_array_length(portal_atendimento.md_execucoes_lista(true)) e"));
    expect(execs.rows[0]).toEqual({ n: 6, e: 1 });
  });

  it("agenda desligada: a rodada do pg_cron não roda, a manual sim", async () => {
    await svc.query("update portal_atendimento.md_config set ativo = false, travado_ate = null");
    expect((await svc.query("select portal_atendimento.md_rodada_iniciar('agenda') as r")).rows[0].r).toBeNull();
    expect((await svc.query("select portal_atendimento.md_rodada_iniciar('manual') as r")).rows[0].r).not.toBeNull();
    await svc.query("update portal_atendimento.md_config set travado_ate = null");
  });
});

describe("tela Tickets", () => {
  const lista = (p: object) => asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_tickets_lista($1) as r", [JSON.stringify(p)])).then((r) => r.rows[0].r);

  it("filtra por palavra sem acento no assunto e nas ações, por número, data, status e responsável", async () => {
    expect((await lista({ texto: "certidao" })).tickets.map((t: { id: number }) => t.id)).toEqual([188081]);
    expect((await lista({ texto: "BOLETO segunda" })).tickets.map((t: { id: number }) => t.id)).toEqual([188002]);
    expect((await lista({ texto: "boleto escritura" })).total).toBe(0);
    expect((await lista({ num: "188002" })).total).toBe(1);
    expect((await lista({ de: "2026-10-06", ate: "2026-10-06" })).tickets.map((t: { id: number }) => t.id)).toEqual([188081]);
    expect((await lista({ ano: 2025 })).total).toBe(0);
    expect((await lista({ statusBase: "Stopped" })).total).toBe(1);
    expect((await lista({ responsavel: "Débora Braga" })).total).toBe(1);
    const todos = await lista({});
    expect(todos.tickets.map((t: { id: number }) => t.id)).toEqual([188081, 188002]);
    expect(todos.tickets[0]).toMatchObject({ origem: "Origem 99", slaPausado: true });
    expect(todos.tickets[1]).toMatchObject({ origem: "E-mail recebido" });
  });

  it("filtros e detalhe com ações e históricos", async () => {
    const f = (await asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_filtros_opcoes() as r"))).rows[0].r;
    expect(f).toMatchObject({ anos: [2026], equipes: ["CRC"], statusBase: ["Resolved", "Stopped"] });
    const d = (await asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_ticket_detalhe(188081) as r"))).rows[0].r;
    expect(d.acoes).toHaveLength(2);
    expect(d.acoes[0].anexos).toEqual([{ nome: "doc.pdf", link: "https://x" }]);
    expect(d.historicoStatus).toHaveLength(1);
    expect(d.historicoResponsavel[0]).toMatchObject({ responsavel: "Monique Santos Silva" });
    expect(await codigoErro(asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_ticket_detalhe(1)")))).toBe("NOT_FOUND");
  });
});

describe("anexos", () => {
  const paginaComAnexos = (caminhos: string[]) => ({
    tickets: [{ id: 300, assunto: "Com anexo", criado_em: "2026-10-10T10:00:00Z" }],
    acoes: [{ ticket_id: 300, acao_id: 1, texto: "veja", anexos: caminhos.map((c, i) => ({ nome: `arq${i}.pdf`, caminho: c, em: "2026-10-10T10:00:00Z" })) }],
  });
  const resultado = (p: object) => svc.query("select portal_atendimento.md_anexo_resultado($1)", [JSON.stringify(p)]);

  it("entram na fila uma vez só, mesmo com a página gravada de novo", async () => {
    await svc.query("select portal_atendimento.md_upsert_pagina($1)", [JSON.stringify(paginaComAnexos(["c1", "c2"]))]);
    await svc.query("select portal_atendimento.md_upsert_pagina($1)", [JSON.stringify(paginaComAnexos(["c1", "c2"]))]);
    const r = await svc.query("select caminho_movidesk, situacao from portal_atendimento.md_anexos where ticket_id = 300 order by id");
    expect(r.rows).toEqual([{ caminho_movidesk: "c1", situacao: "pendente" }, { caminho_movidesk: "c2", situacao: "pendente" }]);
  });

  it("reserva, baixa, registra erro com nova tentativa e soma no progresso", async () => {
    const pegou = (await svc.query("select portal_atendimento.md_anexos_pegar('manual', 10) as r")).rows[0].r;
    expect(pegou.maxBytes).toBe(50 * 1024 * 1024);
    expect(pegou.anexos.map((a: { caminho: string }) => a.caminho)).toEqual(["c1", "c2"]);
    // Reservados: outra chamada não pega os mesmos.
    expect((await svc.query("select portal_atendimento.md_anexos_pegar('manual', 10) as r")).rows[0].r).toBeNull();

    const [a1, a2] = pegou.anexos;
    await resultado({ id: a1.id, ok: true, storagePath: "movidesk/300/1/arq0.pdf", tipo: "application/pdf", tamanho: 2048 });
    await resultado({ id: a2.id, ok: false, erro: "HTTP 500" });
    // Erro: volta só depois de 30 min.
    expect((await svc.query("select portal_atendimento.md_anexos_pegar('manual', 10) as r")).rows[0].r).toBeNull();
    await svc.query("update portal_atendimento.md_anexos set proxima_tentativa = now() - interval '1 minute' where id = $1", [a2.id]);
    expect((await svc.query("select portal_atendimento.md_anexos_pegar('manual', 10) as r")).rows[0].r.anexos).toHaveLength(1);
    await resultado({ id: a2.id, ok: false, erro: "HTTP 500" });
    await svc.query("update portal_atendimento.md_anexos set tentativas = 3 where id = $1", [a2.id]);

    const cfg = (await asUser(db.admin, claims(superAdmin), (c) => c.query("select portal_atendimento.md_config_ler() -> 'anexos' as a"))).rows[0].a;
    expect(cfg).toMatchObject({ total: 2, baixados: 1, pendentes: 0, erros: 1, bytes: 2048 });
    const n = (await asUser(db.admin, claims(superAdmin), (c) => c.query("select portal_atendimento.md_anexos_tentar_de_novo() as n"))).rows[0].n;
    expect(n).toBe(1);
  });

  it("arquivo acima do limite fica como grande; com a chave desligada, a agenda não baixa", async () => {
    await svc.query("select portal_atendimento.md_upsert_pagina($1)", [JSON.stringify(paginaComAnexos(["c1", "c2", "c3"]))]);
    const pegou = (await svc.query("select portal_atendimento.md_anexos_pegar('manual', 1) as r")).rows[0].r;
    await resultado({ id: pegou.anexos[0].id, grande: true, tamanho: 99_000_000, erro: "Maior que 50 MB" });
    expect((await svc.query("select situacao from portal_atendimento.md_anexos where id = $1", [pegou.anexos[0].id])).rows[0].situacao).toBe("grande");
    await svc.query("update portal_atendimento.md_config set baixar_anexos = false");
    expect((await svc.query("select portal_atendimento.md_anexos_pegar('manual', 10) as r")).rows[0].r).toBeNull();
    await svc.query("update portal_atendimento.md_config set baixar_anexos = true");
  });

  it("Admin vê os anexos do ticket; operador não", async () => {
    const r = (await asUser(db.admin, claims(admin), (c) => c.query("select portal_atendimento.md_ticket_anexos(300) as r"))).rows[0].r;
    expect(r.find((a: { storagePath: string | null }) => a.storagePath)).toMatchObject({ nome: "arq0.pdf", situacao: "baixado", tamanho: 2048 });
    expect(await codigoErro(asUser(db.admin, claims(operador), (c) => c.query("select portal_atendimento.md_ticket_anexos(300)")))).toBe("FORBIDDEN");
  });
});
describe("safeupdate do PostgREST", () => {
  // O papel authenticator carrega pg-safeupdate: UPDATE/DELETE sem WHERE é recusado pela API (a SQL do painel passa).
  it("nenhuma função md_* faz UPDATE ou DELETE sem WHERE", async () => {
    const { rows } = await db.admin.query(
      "select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'portal_atendimento'::regnamespace and p.proname like 'md\\_%'",
    );
    const semWhere: string[] = [];
    for (const r of rows as { proname: string; prosrc: string }[]) {
      const corpo = r.prosrc.replace(/--[^\n]*/g, "");
      for (const comando of corpo.split(";")) {
        if (/\b(update\s+portal_atendimento\.\w+\s+(as\s+\w+\s+)?set|delete\s+from\s+portal_atendimento\.\w+)\b/i.test(comando) && !/\bwhere\b/i.test(comando)) {
          semWhere.push(`${r.proname}: ${comando.trim().slice(0, 60)}`);
        }
      }
    }
    expect(semWhere).toEqual([]);
  });
});