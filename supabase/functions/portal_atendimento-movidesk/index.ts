// Gestão Tickets Movidesk (docs/PLANO-tickets-movidesk.md): espelho só leitura dos tickets e anexos do Movidesk.
// Chamada pelo pg_cron a cada 1 min (job portal-atendimento-movidesk-1min), sem JWT: a autenticação é o cabeçalho
// x-movidesk-chave (chave no Vault). As ações manuais exigem um Super admin logado.
//
//   {acao: "rodada"}             pg_cron: se a agenda permitir, 1 a 3 páginas de tickets + anexos pendentes
//   {acao: "sincronizar_agora"}  botão da tela: 1 página + anexos, fora da agenda (respeita a trava)
//   {acao: "testar"}             as 3 rotas com $top=1 e o maior id do Movidesk (para a estimativa)
//
// A resposta sai na hora e o trabalho continua em segundo plano (EdgeRuntime.waitUntil): a página leva de 40 a 70 s.
// A trava (md_rodada_iniciar) impede duas rodadas de tickets juntas; os anexos são reservados um a um (md_anexos_pegar).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, errorResponse, fromRpcError, json, PortalError, portalContext, type AdminClient } from "../_shared/portal.ts";
import { AnexoGrande, baixarAnexo, buscarPagina, caminhoStorage, mapearPagina, tokenLimpo } from "../_shared/movidesk/movidesk.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const BUCKET = "movidesk-anexos";
/** Não começa página nova depois disso (o limite da Edge é 150 s no plano gratuito). */
const LIMITE_NOVA_PAGINA_MS = 60_000;
/** Tempo para baixar anexos dentro de uma rodada. */
const LIMITE_ANEXOS_MS = 80_000;
const ANEXOS_EM_PARALELO = 4;

type Origem = "agenda" | "manual";

interface Credencial {
  token: string | null;
  select: string;
  expand: string;
}

interface Proxima {
  etapa: "recentes" | "past" | "incremental";
  rota: string;
  filtro: string;
  paginas?: number;
}

interface AnexoReservado {
  id: number;
  ticketId: number;
  acaoId: number;
  nome: string;
  caminho: string;
}

const msg = (e: unknown) => String(e instanceof Error ? e.message : e);

/** Compara sem atalho (tempo constante para tamanhos iguais). */
function iguais(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function rpc<T>(db: AdminClient, nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw fromRpcError(error);
  return data as T;
}

async function credencial(db: AdminClient): Promise<Credencial & { token: string }> {
  const c = await rpc<Credencial>(db, "md_ler_credencial");
  const token = tokenLimpo(c?.token);
  if (!token) throw new PortalError("INTEGRATION_NOT_CONFIGURED", "Salve o token do Movidesk em Integrações › Movidesk.");
  return { ...c, token };
}

/** Páginas de tickets: uma por vez, avançando o cursor no banco a cada página. */
async function paginas(db: AdminClient, cred: Credencial & { token: string }, inicio: Proxima, origem: Origem, por: string | null) {
  const comeco = Date.now();
  const total = Math.max(1, inicio.paginas ?? 1);
  let atual: Proxima = inicio;
  const feitas: unknown[] = [];
  for (let i = 0; i < total; i++) {
    const ultima = i === total - 1;
    let resumo: Record<string, unknown> = { origem, etapa: atual.etapa, filtro: atual.filtro, por };
    try {
      const pag = await buscarPagina(fetch, { token: cred.token, rota: atual.rota, select: cred.select, expand: cred.expand, filtro: atual.filtro });
      const mapa = mapearPagina(pag.tickets);
      await rpc<number>(db, "md_upsert_pagina", { p: { tickets: mapa.tickets, acoes: mapa.acoes, statusHist: mapa.statusHist, responsavelHist: mapa.responsavelHist } });
      const acabou = pag.tickets.length < 100;
      const parar = ultima || acabou || Date.now() - comeco > LIMITE_NOVA_PAGINA_MS;
      resumo = { ...resumo, qtd: pag.tickets.length, ultimoId: mapa.ultimoId, maiorUpdate: mapa.maiorUpdate, ms: pag.ms, kb: pag.kb, http: pag.http, ultima: parar };
      atual = await rpc<Proxima>(db, "md_rodada_concluir", { p: resumo });
      feitas.push({ etapa: resumo.etapa, qtd: resumo.qtd, ms: resumo.ms });
      if (parar) break;
    } catch (e) {
      const err = e as { http?: number; ms?: number };
      await rpc(db, "md_rodada_concluir", { p: { ...resumo, qtd: 0, http: err.http ?? null, ms: err.ms ?? null, erro: msg(e), ultima: true } }).catch((x) =>
        console.error(JSON.stringify({ evento: "movidesk.concluir_falhou", erro: msg(x) })),
      );
      feitas.push({ etapa: resumo.etapa, erro: msg(e) });
      break;
    }
  }
  return feitas;
}

/** Anexos pendentes: reserva em lotes e baixa 4 de cada vez até acabar a fila ou o tempo. */
async function anexos(db: AdminClient, token: string, origem: Origem) {
  const comeco = Date.now();
  let baixados = 0;
  let falhas = 0;
  while (Date.now() - comeco < LIMITE_ANEXOS_MS) {
    const lote = await rpc<{ maxBytes: number; anexos: AnexoReservado[] } | null>(db, "md_anexos_pegar", { p_origem: origem, p_limite: 20 });
    if (!lote?.anexos?.length) break;
    const fila = [...lote.anexos];
    const trabalhar = async () => {
      for (let a = fila.shift(); a; a = fila.shift()) {
        if (Date.now() - comeco > LIMITE_ANEXOS_MS + 20_000) {
          // Sem tempo: devolve para a fila (a reserva expira e outro ciclo pega).
          continue;
        }
        try {
          const arq = await baixarAnexo(fetch, token, a.caminho, lote.maxBytes);
          const caminho = caminhoStorage(a);
          const up = await db.storage.from(BUCKET).upload(caminho, arq.bytes, { contentType: arq.tipo, upsert: true });
          if (up.error) throw new Error(`Storage: ${up.error.message}`);
          await rpc(db, "md_anexo_resultado", { p: { id: a.id, ok: true, storagePath: caminho, tipo: arq.tipo, tamanho: arq.bytes.byteLength } });
          baixados++;
        } catch (e) {
          falhas++;
          const grande = e instanceof AnexoGrande;
          await rpc(db, "md_anexo_resultado", { p: { id: a.id, ok: false, grande, tamanho: grande ? e.tamanho : null, erro: msg(e) } }).catch(() => {});
        }
      }
    };
    await Promise.all(Array.from({ length: ANEXOS_EM_PARALELO }, trabalhar));
  }
  return { baixados, falhas };
}

/** Rodada completa (tickets e anexos em paralelo). Nunca lança: o resultado vai para o log. */
async function rodada(db: AdminClient, origem: Origem, inicio: Proxima | null, por: string | null) {
  try {
    const cred = await credencial(db);
    const [tickets, arquivos] = await Promise.all([
      inicio ? paginas(db, cred, inicio, origem, por) : Promise.resolve([]),
      anexos(db, cred.token, origem).catch((e) => ({ erro: msg(e) })),
    ]);
    console.log(JSON.stringify({ evento: "movidesk.rodada", origem, tickets, anexos: arquivos }));
  } catch (e) {
    console.error(JSON.stringify({ evento: "movidesk.rodada_falhou", origem, erro: msg(e) }));
    if (inicio) await rpc(db, "md_rodada_concluir", { p: { origem, etapa: inicio.etapa, filtro: inicio.filtro, qtd: 0, erro: msg(e), ultima: true, por } }).catch(() => {});
  }
}

function emSegundoPlano(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
  else void p;
}

/** As 3 rotas com $top=1 (mesmos campos e expansões) e o maior id, para a estimativa da carga. */
async function testar(db: AdminClient, por: string) {
  const cred = await credencial(db);
  const rotas = [
    { nome: "Carga histórica", rota: "tickets/past", filtro: "id gt 0" },
    { nome: "Tickets recentes", rota: "tickets", filtro: "id gt 0" },
    { nome: "Incremental", rota: "tickets", filtro: `lastUpdate ge ${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}T00:00:00.00z and id gt 0` },
  ];
  const resultado = await Promise.all(
    rotas.map(async (r) => {
      const t0 = Date.now();
      try {
        const pag = await buscarPagina(fetch, { token: cred.token, rota: r.rota, select: cred.select, expand: cred.expand, filtro: r.filtro, top: 1 }, 60_000);
        return { nome: r.nome, rota: r.rota, ok: true, http: pag.http, ms: pag.ms };
      } catch (e) {
        const err = e as { http?: number };
        return { nome: r.nome, rota: r.rota, ok: false, http: err.http ?? null, ms: Date.now() - t0, erro: msg(e) };
      }
    }),
  );
  let maiorId: number | null = null;
  try {
    const topo = await buscarPagina(fetch, { token: cred.token, rota: "tickets", select: "id", expand: "", filtro: "id gt 0", orderby: "id desc", top: 1 }, 60_000);
    maiorId = topo.tickets[0]?.id ?? null;
  } catch {
    // A estimativa é opcional.
  }
  const teste = { em: new Date().toISOString(), rotas: resultado, maiorId, por };
  await rpc(db, "md_teste_registrar", { p: teste });
  return teste;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "INVALID_INPUT", message: "Método não suportado." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new PortalError("INTERNAL", "Função sem configuração do Supabase.", 500);
    const db: AdminClient = createClient(url, key, { db: { schema: "portal_atendimento" }, auth: { persistSession: false, autoRefreshToken: false } });
    const corpo = (await req.json().catch(() => ({}))) as { acao?: string };

    // pg_cron: chave do Vault.
    const chave = await db.rpc("md_cron_chave");
    if (iguais(req.headers.get("x-movidesk-chave") ?? "", (chave.data as string | null) ?? "")) {
      if ((corpo.acao ?? "rodada") !== "rodada") throw new PortalError("INVALID_INPUT", `Ação inválida: ${corpo.acao}`);
      const inicio = await rpc<Proxima | null>(db, "md_rodada_iniciar", { p_origem: "agenda" });
      emSegundoPlano(rodada(db, "agenda", inicio, null));
      return json({ iniciou: !!inicio });
    }

    // Manual: só o Super admin logado.
    const { caller } = await portalContext(req);
    const perfil = await db.rpc("perfil_de", { p_usuario: caller.id });
    if (perfil.data !== "super_admin") throw new PortalError("FORBIDDEN", "Só o Super admin sincroniza e testa o Movidesk.", 403);

    if (corpo.acao === "testar") return json(await testar(db, caller.id));
    if (corpo.acao === "sincronizar_agora") {
      const inicio = await rpc<Proxima | null>(db, "md_rodada_iniciar", { p_origem: "manual" });
      if (!inicio) throw new PortalError("CONFLICT", "Já existe uma sincronização em andamento (ou falta o token). Tente de novo em alguns minutos.", 409);
      emSegundoPlano(rodada(db, "manual", inicio, caller.id));
      return json({ iniciou: true, etapa: inicio.etapa });
    }
    throw new PortalError("INVALID_INPUT", `Ação inválida: ${corpo.acao}`);
  } catch (error) {
    return errorResponse(error);
  }
});
