// Gestão de Atendimento › Contas de e-mail. Ações (supervisão geral; google_* e rede só super admin):
//   testar         {contaId, enviarPara?}  conexão, login, leitura da pasta e (opcional) e-mail de teste
//   oauth_iniciar  {contaId, retorno}      URL do "Autorizar com Gmail" (o Google volta em portal_atendimento-google-oauth)
//   google_testar  {email}                 a chave da conta de serviço consegue abrir esta caixa?
//   rede           {}                      diagnóstico: o servidor alcança imap.gmail.com:993 e smtp.gmail.com:465?
// Leitura (F4) e envio (F5) entram aqui como novas ações. Senhas e a chave do Google vêm do Vault.

import { corsHeaders, errorResponse, fromRpcError, json, PortalError, portalContext, type AdminClient } from "../_shared/portal.ts";
import type { Passo, Socket } from "../_shared/email/conexao.ts";
import { Linhas } from "../_shared/email/conexao.ts";
import { testarGmail, testarGmailComToken, tokenPorRefresh, urlAutorizacao, type ChaveServico } from "../_shared/email/gmail.ts";
import { testarImap, type Rede } from "../_shared/email/imap.ts";
import { montarMensagem, novoMessageId } from "../_shared/email/mime.ts";
import { testarSmtp } from "../_shared/email/smtp.ts";

const rede: Rede = {
  abrir: (host, porta, tls) => (tls ? Deno.connectTls({ hostname: host, port: porta }) : Deno.connect({ hostname: host, port: porta })) as Promise<Socket>,
  iniciarTls: (socket, host) => Deno.startTls(socket as Deno.TcpConn, { hostname: host }) as Promise<Socket>,
};

async function papel(req: Request): Promise<{ db: AdminClient; callerId: string; email: string; superAdmin: boolean; supervisor: boolean }> {
  const { caller, admin } = await portalContext(req);
  const [perfil, sup] = await Promise.all([
    admin.rpc("perfil_de", { p_usuario: caller.id }),
    admin.rpc("tem_permissao_de", { p_usuario: caller.id, p_permissao: "gestao_atendimento_supervisao" }),
  ]);
  if (perfil.error) throw fromRpcError(perfil.error);
  if (sup.error) throw fromRpcError(sup.error);
  const superAdmin = perfil.data === "super_admin";
  return { db: admin, callerId: caller.id, email: caller.email ?? "", superAdmin, supervisor: superAdmin || sup.data === true };
}

/** Escopos que o portal pede ao Google: os mesmos cadastrados em Clientes da API (at_config.google_escopos). */
async function escopos(db: AdminClient): Promise<string[]> {
  const { data } = await db.from("at_config").select("google_escopos").eq("id", true).maybeSingle();
  const lista = (data?.google_escopos as string[] | null) ?? [];
  return lista.length ? lista : ["https://mail.google.com/"];
}

/** Cliente OAuth do portal (Integrações › Google Workspace). */
async function clienteOAuth(db: AdminClient): Promise<{ clientId: string; clientSecret: string }> {
  const { data, error } = await db.rpc("at_google_oauth_ler");
  if (error) throw fromRpcError(error);
  const l = (data as { client_id: string | null; client_secret: string | null }[] | null)?.[0];
  if (!l?.client_id || !l.client_secret) {
    throw new PortalError("INTEGRATION_NOT_CONFIGURED", "Configure o aplicativo OAuth do Google em Configurações › Integrações › Google Workspace.");
  }
  return { clientId: l.client_id, clientSecret: l.client_secret };
}

const urlRetornoGoogle = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/portal_atendimento-google-oauth`;

async function credenciais(db: AdminClient, contaId: number): Promise<{ senha: string | null; chave: ChaveServico | null }> {
  const { data, error } = await db.rpc("at_email_credenciais", { p_conta: contaId });
  if (error) throw fromRpcError(error);
  const linha = (data as { senha: string | null; google_sa: string | null }[] | null)?.[0];
  let chave: ChaveServico | null = null;
  if (linha?.google_sa) {
    try {
      chave = JSON.parse(linha.google_sa) as ChaveServico;
    } catch {
      chave = null;
    }
  }
  return { senha: linha?.senha ?? null, chave };
}

/** Diagnóstico de rede: abre o TLS e lê a saudação, sem login. */
async function saudacao(host: string, porta: number): Promise<Passo> {
  const inicio = Date.now();
  let c: Linhas | null = null;
  try {
    c = new Linhas(await rede.abrir(host, porta, true), 10_000);
    const l = await c.linha();
    return { passo: `${host}:${porta}`, ok: true, detalhe: `${l.slice(0, 70)} (${Date.now() - inicio} ms)` };
  } catch (e) {
    return { passo: `${host}:${porta}`, ok: false, detalhe: String(e instanceof Error ? e.message : e) };
  } finally {
    c?.fechar();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "INVALID_INPUT", message: "Método não suportado." }, 405);
  try {
    const eu = await papel(req);
    const corpo = (await req.json().catch(() => ({}))) as { acao?: string; contaId?: number; enviarPara?: string; email?: string; retorno?: string };
    const acao = String(corpo.acao ?? "");

    if (acao === "rede") {
      if (!eu.superAdmin) throw new PortalError("FORBIDDEN", "Só o super admin roda o diagnóstico.", 403);
      const passos = await Promise.all([saudacao("imap.gmail.com", 993), saudacao("smtp.gmail.com", 465)]);
      return json({ passos });
    }

    if (acao === "google_testar") {
      if (!eu.superAdmin) throw new PortalError("FORBIDDEN", "Só o super admin configura o Google Workspace.", 403);
      const caixa = String(corpo.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(caixa)) throw new PortalError("INVALID_INPUT", "Informe o e-mail de uma caixa do Workspace para testar.");
      const { chave } = await credenciais(eu.db, 0);
      const passos = await testarGmail(fetch, chave, caixa, "INBOX", undefined, await escopos(eu.db));
      const verificacao = { em: new Date().toISOString(), caixa, ok: passos.every((p) => p.ok), passos };
      const r = await eu.db.from("at_config").update({ google_verificacao: verificacao }).eq("id", true);
      if (r.error) throw fromRpcError(r.error);
      return json(verificacao);
    }

    if (acao === "oauth_iniciar") {
      if (!eu.supervisor) throw new PortalError("FORBIDDEN", "Só a supervisão geral autoriza as contas de e-mail.", 403);
      const conta = await eu.db.from("at_email_contas").select("id, email, provedor").eq("id", Number(corpo.contaId ?? 0)).maybeSingle();
      if (conta.error) throw fromRpcError(conta.error);
      if (!conta.data) throw new PortalError("NOT_FOUND", "Conta não encontrada.", 404);
      if (conta.data.provedor !== "google") throw new PortalError("INVALID_INPUT", "Autorizar com Gmail só vale para contas do Google Workspace / Gmail.");
      const { clientId } = await clienteOAuth(eu.db);
      const st = await eu.db.rpc("at_email_oauth_estado_criar", { p_conta: conta.data.id, p_usuario: eu.callerId, p_retorno: String(corpo.retorno ?? "") });
      if (st.error) throw fromRpcError(st.error);
      return json({ url: urlAutorizacao({ clientId, redirectUri: urlRetornoGoogle(), state: st.data as string, caixa: conta.data.email }) });
    }

    if (acao === "testar") {
      if (!eu.supervisor) throw new PortalError("FORBIDDEN", "Só a supervisão geral testa as contas de e-mail.", 403);
      const conta = await eu.db.from("at_email_contas").select("*").eq("id", Number(corpo.contaId ?? 0)).maybeSingle();
      if (conta.error) throw fromRpcError(conta.error);
      const c = conta.data;
      if (!c) throw new PortalError("NOT_FOUND", "Conta não encontrada.", 404);
      const { senha, chave } = await credenciais(eu.db, c.id);
      const para = String(corpo.enviarPara ?? "").trim().toLowerCase();
      const teste = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)
        ? {
            para,
            mensagem: montarMensagem({
              de: c.email,
              deNome: c.nome_remetente,
              para: [para],
              assunto: `Teste da conta ${c.nome} · Portal Atendimento`,
              texto: `Este é um e-mail de teste da conta ${c.email} no Portal Atendimento da Calper.\nSe chegou, o envio está funcionando.`,
              messageId: novoMessageId(c.email.split("@")[1] ?? "calper.com.br"),
            }),
          }
        : undefined;

      let passos: Passo[];
      if (c.modo === "oauth_google") {
        const refresh = await eu.db.rpc("at_email_oauth_token", { p_conta: c.id });
        if (refresh.error) throw fromRpcError(refresh.error);
        const app = await clienteOAuth(eu.db);
        passos = await testarGmailComToken(
          fetch,
          async () => {
            if (!refresh.data) throw new Error("A caixa ainda não foi autorizada: clique em Autorizar com Gmail.");
            return tokenPorRefresh(fetch, { ...app, refreshToken: refresh.data as string });
          },
          { passo: "Autorização do Google (OAuth)", detalhe: `autorizado como ${c.oauth_email ?? c.email}` },
          c.pasta,
          teste,
        );
      } else if (c.modo === "api_google") {
        passos = await testarGmail(fetch, chave, c.email, c.pasta, teste, await escopos(eu.db));
      } else {
        const usuario = c.usuario ?? c.email;
        passos = [
          ...(await testarImap({ host: c.imap_host ?? "", porta: c.imap_porta, seguranca: c.imap_seguranca, usuario, senha, pasta: c.pasta }, rede)),
          ...(await testarSmtp({ host: c.smtp_host ?? "", porta: c.smtp_porta, usuario, senha }, rede, teste ? { de: c.email, ...teste } : undefined)),
        ];
      }
      const ok = passos.every((p) => p.ok);
      const verificacao = { em: new Date().toISOString(), ok, passos };
      const r = await eu.db
        .from("at_email_contas")
        .update({ verificacao, status: ok ? "conectado" : "falha", ultimo_erro: ok ? null : (passos.find((p) => !p.ok)?.detalhe ?? null) })
        .eq("id", c.id);
      if (r.error) throw fromRpcError(r.error);
      return json(verificacao);
    }

    throw new PortalError("INVALID_INPUT", `Ação inválida: ${acao}`);
  } catch (error) {
    return errorResponse(error);
  }
});
