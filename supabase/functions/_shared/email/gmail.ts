// API do Gmail com conta de serviço do Google Workspace (delegação no domínio): o portal pede um token
// "em nome de" cada caixa @calper.com.br, sem senha por conta. Só HTTPS: roda em Edge Function.
// Configuração da TI (uma vez): Google Cloud › conta de serviço › chave JSON; Admin do Workspace ›
// Segurança › Controles de API › Delegação em todo o domínio › Clientes da API › Adicionar novo: o client_id
// da conta e os escopos. O Google só emite o token se os escopos pedidos estiverem EXATAMENTE nessa lista;
// por isso os escopos são configuráveis (padrão: https://mail.google.com/, o mesmo já usado na Calper).

import type { Passo } from "./conexao.ts";
import { base64url } from "./mime.ts";

export const ESCOPOS_PADRAO = ["https://mail.google.com/"];
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

type Fetch = typeof fetch;

export interface ChaveServico {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function pemParaDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const b64urlBytes = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Monta o JWT (assertion) da conta de serviço para a caixa `caixa`. */
export async function assertion(chave: ChaveServico, caixa: string, agora = Math.floor(Date.now() / 1000), escopos: string[] = ESCOPOS_PADRAO): Promise<string> {
  const cab = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({ iss: chave.client_email, sub: caixa, scope: escopos.join(" "), aud: chave.token_uri ?? "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 }),
  );
  const k = await crypto.subtle.importKey("pkcs8", pemParaDer(chave.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(`${cab}.${corpo}`)));
  return `${cab}.${corpo}.${b64urlBytes(assinatura)}`;
}

/** Erro do Google em português, com a causa mais comum de cada código. */
export function erroGoogle(status: number, corpo: string): string {
  let msg = corpo.slice(0, 200);
  try {
    const j = JSON.parse(corpo) as { error?: string | { message?: string }; error_description?: string };
    msg = typeof j.error === "string" ? `${j.error}${j.error_description ? `: ${j.error_description}` : ""}` : (j.error?.message ?? msg);
  } catch {
    /* não-JSON */
  }
  if (/unauthorized_client/i.test(msg)) {
    return "O Google recusou a delegação: o Client ID da conta de serviço não está em Clientes da API ou os escopos cadastrados lá não são os mesmos que o portal pede (Admin › Segurança › Controles de API › Delegação em todo o domínio).";
  }
  if (/invalid_grant/i.test(msg)) return `O Google recusou a caixa: confira se o endereço existe no Workspace (${msg}).`;
  return `Google respondeu ${status}: ${msg}`;
}

export async function tokenDaCaixa(f: Fetch, chave: ChaveServico, caixa: string, escopos: string[] = ESCOPOS_PADRAO): Promise<string> {
  const r = await f(chave.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await assertion(chave, caixa, undefined, escopos) }),
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(erroGoogle(r.status, texto));
  return (JSON.parse(texto) as { access_token: string }).access_token;
}

/** Pasta: "INBOX" e marcadores do sistema usam o próprio id; marcador criado pelo usuário é buscado pelo nome. */
async function rotulo(f: Fetch, token: string, pasta: string): Promise<{ total: number; naoLidas: number }> {
  const h = { Authorization: `Bearer ${token}` };
  let id = pasta.toUpperCase() === "INBOX" ? "INBOX" : pasta;
  if (id !== "INBOX") {
    const lista = await f(`${GMAIL}/labels`, { headers: h, signal: AbortSignal.timeout(15_000) });
    if (!lista.ok) throw new Error(erroGoogle(lista.status, await lista.text()));
    const achado = ((await lista.json()) as { labels?: { id: string; name: string }[] }).labels?.find((l) => l.name.toLowerCase() === pasta.toLowerCase());
    if (!achado) throw new Error(`Pasta "${pasta}" não existe nesta caixa.`);
    id = achado.id;
  }
  const r = await f(`${GMAIL}/labels/${encodeURIComponent(id)}`, { headers: h, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(erroGoogle(r.status, await r.text()));
  const j = (await r.json()) as { messagesTotal?: number; messagesUnread?: number };
  return { total: j.messagesTotal ?? 0, naoLidas: j.messagesUnread ?? 0 };
}

export async function enviarGmail(f: Fetch, token: string, mensagemRfc822: string): Promise<string> {
  const r = await f(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64url(mensagemRfc822) }),
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(erroGoogle(r.status, texto));
  return (JSON.parse(texto) as { id: string }).id;
}

// ---------------------------------------------------------------- OAuth2 por conta ("Autorizar com Gmail")
// A TI cria um "ID do cliente OAuth" (Aplicativo da Web, tela de consentimento Interna). Alguém entra no Google
// com a própria caixa e autoriza; o refresh token fica no Vault. Mesmo modelo da Movidesk.

export const ESCOPOS_OAUTH = ["https://mail.google.com/", "openid", "email"];

export function urlAutorizacao(p: { clientId: string; redirectUri: string; state: string; caixa: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: ESCOPOS_OAUTH.join(" "),
    access_type: "offline",
    // Sempre pede o consentimento: é o que garante o refresh_token também na reautorização.
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: p.caixa,
    state: p.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

/** E-mail da conta que autorizou, lido do id_token (vem direto do Google pelo canal TLS do token). */
export function emailDoIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const corpo = idToken.split(".")[1] ?? "";
    const json = JSON.parse(atob(corpo.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(corpo.length / 4) * 4, "="))) as { email?: string };
    return json.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function trocarCodigo(f: Fetch, p: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<{ refreshToken: string | null; accessToken: string; email: string | null }> {
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri }),
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(erroGoogle(r.status, texto));
  const j = JSON.parse(texto) as { access_token: string; refresh_token?: string; id_token?: string };
  return { refreshToken: j.refresh_token ?? null, accessToken: j.access_token, email: emailDoIdToken(j.id_token) };
}

export async function tokenPorRefresh(f: Fetch, p: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string> {
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text();
  if (!r.ok) {
    if (/invalid_grant/i.test(texto)) throw new Error("A autorização do Google expirou ou foi revogada: clique em Reautorizar com Gmail.");
    throw new Error(erroGoogle(r.status, texto));
  }
  return (JSON.parse(texto) as { access_token: string }).access_token;
}

/** Leitura da pasta e (opcional) envio de teste com um token já obtido (OAuth ou conta de serviço). */
export async function testarGmailComToken(
  f: Fetch,
  obterToken: () => Promise<string>,
  conexao: { passo: string; detalhe: string },
  pasta: string,
  teste?: { mensagem: string; para: string },
): Promise<Passo[]> {
  const passos: Passo[] = [];
  let token: string;
  try {
    token = await obterToken();
    passos.push({ passo: conexao.passo, ok: true, detalhe: conexao.detalhe });
  } catch (e) {
    passos.push({ passo: conexao.passo, ok: false, detalhe: String(e instanceof Error ? e.message : e) });
    return passos;
  }
  try {
    const st = await rotulo(f, token, pasta);
    passos.push({ passo: `Leitura da pasta ${pasta}`, ok: true, detalhe: `${st.total} e-mails, ${st.naoLidas} não lidos` });
  } catch (e) {
    passos.push({ passo: `Leitura da pasta ${pasta}`, ok: false, detalhe: String(e instanceof Error ? e.message : e) });
  }
  if (teste) {
    try {
      await enviarGmail(f, token, teste.mensagem);
      passos.push({ passo: `E-mail de teste para ${teste.para}`, ok: true, detalhe: "enviado (fica em Enviados da caixa)" });
    } catch (e) {
      passos.push({ passo: `E-mail de teste para ${teste.para}`, ok: false, detalhe: String(e instanceof Error ? e.message : e) });
    }
  }
  return passos;
}

/** Teste pela API: autorização da caixa, leitura da pasta e (opcional) envio de teste. */
export async function testarGmail(f: Fetch, chave: ChaveServico | null, caixa: string, pasta: string, teste?: { mensagem: string; para: string }, escopos: string[] = ESCOPOS_PADRAO): Promise<Passo[]> {
  const passos: Passo[] = [];
  if (!chave) return [{ passo: "Conexão com o Google Workspace", ok: false, detalhe: "A chave da conta de serviço ainda não foi salva (Configurações › Integrações › Google Workspace)." }];
  let token: string;
  try {
    token = await tokenDaCaixa(f, chave, caixa, escopos);
    passos.push({ passo: "Conexão com o Google Workspace", ok: true, detalhe: `autorizado para ${caixa} (${escopos.join(", ")})` });
  } catch (e) {
    passos.push({ passo: "Conexão com o Google Workspace", ok: false, detalhe: String(e instanceof Error ? e.message : e) });
    return passos;
  }
  try {
    const st = await rotulo(f, token, pasta);
    passos.push({ passo: `Leitura da pasta ${pasta}`, ok: true, detalhe: `${st.total} e-mails, ${st.naoLidas} não lidos` });
  } catch (e) {
    passos.push({ passo: `Leitura da pasta ${pasta}`, ok: false, detalhe: String(e instanceof Error ? e.message : e) });
  }
  if (teste) {
    try {
      await enviarGmail(f, token, teste.mensagem);
      passos.push({ passo: `E-mail de teste para ${teste.para}`, ok: true, detalhe: "enviado (fica em Enviados da caixa)" });
    } catch (e) {
      passos.push({ passo: `E-mail de teste para ${teste.para}`, ok: false, detalhe: String(e instanceof Error ? e.message : e) });
    }
  }
  return passos;
}
