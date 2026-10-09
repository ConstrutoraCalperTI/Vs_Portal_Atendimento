// WhatsApp do atendimento (docs/PLANO-conversas-whatsapp-openwa.md, Fases 2 e 3). verify_jwt = false, duas portas:
//   1. pg_cron (job portal-atendimento-whatsapp-1min): cabeçalho x-atendimento-chave (Vault) → acao "ciclo";
//   2. pessoa logada (JWT do portal):
//        despachar {conversaId?}   envia na hora o que a ação deixou pendente (qualquer usuário do portal)
//        openwa_*                  administração do OpenWA (gestão do atendimento; criar/parear: supervisão geral)
//
// O banco decide tudo (at_whatsapp_ciclo, at_conversa_acao…); aqui só entra e sai: Zenvia e OpenWA.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, errorResponse, fromRpcError, json, PortalError, portalContext, type AdminClient } from "../_shared/portal.ts";
import { despachar } from "../_shared/atendimento/despacho.ts";
import { chamarOpenwa, iguais } from "../_shared/atendimento/openwa.ts";

const WEBHOOK = "portal_atendimento-openwa-webhook";

function servico(): AdminClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new PortalError("INTERNAL", "Função sem configuração do Supabase.", 500);
  return createClient(url, key, { db: { schema: "portal_atendimento" }, auth: { persistSession: false, autoRefreshToken: false } });
}

async function openwa(db: AdminClient): Promise<{ url: string; chave: string; segredo: string }> {
  const { data, error } = await db.rpc("at_ler_credencial_openwa");
  if (error) throw fromRpcError(error);
  const l = (data as { url: string | null; chave: string | null; webhook_segredo: string | null }[] | null)?.[0];
  if (!l?.url || !l.chave) throw new PortalError("INTEGRATION_NOT_CONFIGURED", "Salve a URL e a API key do OpenWA antes.");
  return { url: l.url, chave: l.chave, segredo: l.webhook_segredo ?? "" };
}

/** Resposta do OpenWA → erro do portal (a tela mostra a mensagem). */
function exigirOk<T>(r: { ok: boolean; erro: string | null; corpo?: unknown }): T {
  if (!r.ok) throw new PortalError("INVALID_INPUT", r.erro ?? "O OpenWA recusou o pedido.", 502);
  return r.corpo as T;
}

const sessaoValida = (s: unknown) => {
  const v = String(s ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(v)) throw new PortalError("INVALID_INPUT", "Sessão inválida.", 400, "sessao");
  return encodeURIComponent(v);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "INVALID_INPUT", message: "Método não suportado." }, 405);
  try {
    const db = servico();
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(corpo.acao ?? "");

    // ---------- agendador ----------
    const chaveCron = req.headers.get("x-atendimento-chave");
    if (chaveCron) {
      const { data } = await db.rpc("at_whatsapp_cron_chave");
      if (!iguais(chaveCron, (data as string | null) ?? "")) throw new PortalError("UNAUTHENTICATED", "Agendador não autorizado.", 401);
      if (acao !== "ciclo") throw new PortalError("INVALID_INPUT", `Ação inválida para o agendador: ${acao}`);
      const ciclo = await db.rpc("at_whatsapp_ciclo");
      if (ciclo.error) console.error(JSON.stringify({ evento: "whatsapp.ciclo_falhou", erro: ciclo.error.message }));
      const envio = await despachar(db, { limite: 60 });
      return json({ ciclo: ciclo.data ?? null, envio });
    }

    // ---------- pessoa logada ----------
    const { caller, admin } = await portalContext(req);
    if (acao === "despachar") {
      const conversaId = corpo.conversaId ? Number(corpo.conversaId) : null;
      return json(await despachar(db, { conversaId, limite: 20 }));
    }

    if (!acao.startsWith("openwa_")) throw new PortalError("INVALID_INPUT", `Ação inválida: ${acao}`);
    const [perfil, sup] = await Promise.all([
      admin.rpc("perfil_de", { p_usuario: caller.id }),
      admin.rpc("tem_permissao_de", { p_usuario: caller.id, p_permissao: "gestao_atendimento_supervisao" }),
    ]);
    const supervisao = perfil.data === "super_admin" || sup.data === true;
    if (!supervisao && !["openwa_grupos", "openwa_membros", "openwa_status"].includes(acao)) {
      throw new PortalError("FORBIDDEN", "Só a supervisão geral configura o OpenWA.", 403);
    }
    const ow = await openwa(db);

    switch (acao) {
      case "openwa_testar": {
        const saude = await chamarOpenwa(fetch, ow.url, ow.chave, "GET", "/health/ready");
        const sessoes = await chamarOpenwa(fetch, ow.url, ow.chave, "GET", "/sessions");
        const verificacao = {
          em: new Date().toISOString(),
          ok: saude.ok && sessoes.ok,
          erro: saude.ok ? sessoes.erro : saude.erro,
          sessoes: Array.isArray(sessoes.corpo) ? (sessoes.corpo as { id: string; name?: string; status?: string; phone?: string }[]).map((s) => ({ id: s.id, nome: s.name ?? null, status: s.status ?? null, telefone: s.phone ?? null })) : [],
        };
        await db.rpc("at_openwa_verificacao_salvar", { p: verificacao });
        return json(verificacao);
      }
      case "openwa_status": {
        const s = sessaoValida(corpo.sessao);
        return json(exigirOk(await chamarOpenwa(fetch, ow.url, ow.chave, "GET", `/sessions/${s}`)));
      }
      case "openwa_criar_sessao": {
        const nome = String(corpo.nome ?? "").trim();
        if (!/^[A-Za-z0-9 _-]{2,60}$/.test(nome)) throw new PortalError("INVALID_INPUT", "Nome da sessão: 2 a 60 letras, números, espaço, _ ou -.", 400, "nome");
        return json(exigirOk(await chamarOpenwa(fetch, ow.url, ow.chave, "POST", "/sessions", { name: nome })));
      }
      case "openwa_iniciar": {
        const s = sessaoValida(corpo.sessao);
        return json(exigirOk(await chamarOpenwa(fetch, ow.url, ow.chave, "POST", `/sessions/${s}/start`, {})));
      }
      case "openwa_qr": {
        const s = sessaoValida(corpo.sessao);
        const r = await chamarOpenwa(fetch, ow.url, ow.chave, "GET", `/sessions/${s}/qr`);
        // 400 = ainda não pronto ou já pareado: a tela mostra o status.
        return json({ qr: r.ok ? ((r.corpo as { qrCode?: string })?.qrCode ?? null) : null, erro: r.ok ? null : r.erro });
      }
      case "openwa_grupos": {
        const s = sessaoValida(corpo.sessao);
        return json(exigirOk(await chamarOpenwa(fetch, ow.url, ow.chave, "GET", `/sessions/${s}/groups`)));
      }
      case "openwa_membros": {
        const s = sessaoValida(corpo.sessao);
        const g = String(corpo.grupo ?? "");
        if (!g.endsWith("@g.us")) throw new PortalError("INVALID_INPUT", "Grupo inválido.", 400, "grupo");
        const info = exigirOk<{ participants?: { id: string; number?: string; name?: string; isAdmin?: boolean }[] }>(
          await chamarOpenwa(fetch, ow.url, ow.chave, "GET", `/sessions/${s}/groups/${encodeURIComponent(g)}`),
        );
        return json((info.participants ?? []).map((p) => ({ id: p.id, numero: (p.number ?? p.id.split("@")[0] ?? "").replace(/\D/g, ""), nome: p.name ?? null, admin: Boolean(p.isAdmin) })));
      }
      case "openwa_webhook": {
        // Cadastra (ou atualiza) o webhook desta sessão apontando para o portal, com o segredo do Vault.
        // message.received: o que chega; message.sent: o que o dono do número digita no próprio celular.
        const s = sessaoValida(corpo.sessao);
        const destino = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${WEBHOOK}`;
        const eventos = ["message.received", "message.sent"];
        const lista = await chamarOpenwa(fetch, ow.url, ow.chave, "GET", `/sessions/${s}/webhooks`);
        const existentes = Array.isArray(lista.corpo) ? (lista.corpo as { id?: string; url?: string; events?: string[] }[]) : [];
        const atual = existentes.find((w) => w.url === destino);
        if (atual?.id) {
          if (eventos.every((x) => atual.events?.includes(x))) return json({ criado: false, url: destino });
          exigirOk(await chamarOpenwa(fetch, ow.url, ow.chave, "PUT", `/sessions/${s}/webhooks/${encodeURIComponent(atual.id)}`, { events: eventos, secret: ow.segredo }));
          return json({ criado: false, atualizado: true, url: destino });
        }
        exigirOk(await chamarOpenwa(fetch, ow.url, ow.chave, "POST", `/sessions/${s}/webhooks`, {
          url: destino,
          events: eventos,
          secret: ow.segredo,
          retryCount: 3,
        }));
        return json({ criado: true, url: destino });
      }
    }
    throw new PortalError("INVALID_INPUT", `Ação inválida: ${acao}`);
  } catch (error) {
    return errorResponse(error);
  }
});
