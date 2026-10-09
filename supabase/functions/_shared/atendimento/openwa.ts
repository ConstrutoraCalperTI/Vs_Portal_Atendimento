// Cliente do OpenWA (gateway HTTP do WhatsApp Web, repositório C:\Projetos VSCODE\OpenWA) para a opção A do
// atendimento: privado com o número do sistema + grupo interno de atendentes. TypeScript puro: o fetch entra por
// parâmetro e o HMAC usa a WebCrypto (Deno na Edge Function, Node nos testes).
//
// Contratos (OpenWA v0.24, conferidos no código em 09/10/2026):
//   envio   POST {url}/api/sessions/:id/messages/send-text  {chatId: "<tel>@c.us" | "<grupo>@g.us", text, quotedMessageId?}
//           → {messageId: "true_5521…@c.us_3EB0…", timestamp}. Cabeçalho X-API-Key.
//   webhook {event, timestamp, sessionId, idempotencyKey, deliveryId, data}; assinatura
//           X-OpenWA-Signature: sha256=<hex> = HMAC-SHA256 do CORPO BRUTO com o segredo do webhook.
//   data    IncomingMessage: id, from, chatId, body, type, fromMe, isGroup, author?, senderPhone?, isLidSender?,
//           contact?, media?, quotedMessage? {id, body}.
// Armadilha: remetente "@lid" (id de privacidade) só traz o telefone em senderPhone com RESOLVE_LID_TO_PHONE=true.

export type Fetch = typeof fetch;

const TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------- assinatura

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compara sem atalho (tempo constante para tamanhos iguais). */
export function iguais(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function hmacHex(segredo: string, corpo: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
}

/** Confere o cabeçalho X-OpenWA-Signature ("sha256=<hex>") contra o corpo bruto. */
export async function assinaturaValida(segredo: string, corpoBruto: string, cabecalho: string | null): Promise<boolean> {
  if (!segredo || !cabecalho) return false;
  const recebido = cabecalho.trim().toLowerCase().replace(/^sha256=/, "");
  return iguais(recebido, await hmacHex(segredo, corpoBruto));
}

// ---------------------------------------------------------------- webhook

export type EventoOpenwa =
  | {
      tipo: "privada";
      chave: string | null;
      sessao: string;
      externoId: string;
      de: string;
      nome: string | null;
      texto: string;
      midia: { tipo: "imagem" | "audio" | "video" | "arquivo"; nome: string | null; mime: string } | null;
    }
  | { tipo: "grupo"; chave: string | null; sessao: string; externoId: string; grupo: string; autor: string; texto: string; citadoId: string | null }
  | { tipo: "ignorado"; chave: string | null; sessao: string | null; motivo: string };

/** Telefone (só dígitos) de um JID "5521…@c.us" / "@s.whatsapp.net"; @lid usa o senderPhone resolvido. */
export function telefoneDoJid(jid: string | null | undefined, senderPhone?: string | null): string | null {
  const j = String(jid ?? "");
  if (/@lid$/.test(j)) {
    const d = String(senderPhone ?? "").replace(/\D/g, "");
    return d.length >= 10 ? d : null;
  }
  if (!/@(c\.us|s\.whatsapp\.net)$/.test(j)) return null;
  const d = j.split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

const MIDIA: Record<string, "imagem" | "audio" | "video" | "arquivo"> = {
  image: "imagem",
  sticker: "imagem",
  audio: "audio",
  voice: "audio",
  ptt: "audio",
  video: "video",
  document: "arquivo",
};

/** Lê o envelope do webhook. Só mensagens recebidas; as próprias (fromMe) e status/broadcast são ignoradas. */
export function lerEventoOpenwa(envelope: unknown): EventoOpenwa {
  const e = (envelope ?? {}) as Record<string, unknown>;
  const chave = (e.idempotencyKey as string | undefined) ?? (e.deliveryId as string | undefined) ?? null;
  const sessao = (e.sessionId as string | undefined) ?? null;
  const ign = (motivo: string): EventoOpenwa => ({ tipo: "ignorado", chave, sessao, motivo });
  if (!sessao) return ign("sem sessão");
  if (e.event !== "message.received") return ign(`evento ${String(e.event ?? "?")}`);
  const d = (e.data ?? {}) as Record<string, unknown>;
  if (d.fromMe === true) return ign("mensagem própria");
  if (d.isStatusBroadcast === true || /status@broadcast/.test(String(d.from ?? ""))) return ign("status");
  const externoId = String(d.id ?? "");
  if (!externoId) return ign("sem id");
  const texto = String(d.body ?? "").trim();

  if (d.isGroup === true) {
    const grupo = String(d.chatId ?? d.from ?? "");
    const autor = telefoneDoJid(d.author as string, d.senderPhone as string);
    if (!autor) return ign("autor sem telefone (ligue RESOLVE_LID_TO_PHONE no OpenWA)");
    const q = d.quotedMessage as { id?: string } | undefined;
    return { tipo: "grupo", chave, sessao, externoId, grupo, autor, texto, citadoId: q?.id ? String(q.id) : null };
  }

  const de = telefoneDoJid((d.chatId as string) ?? (d.from as string), d.senderPhone as string) ?? telefoneDoJid(d.from as string, d.senderPhone as string);
  if (!de) return ign("remetente sem telefone (ligue RESOLVE_LID_TO_PHONE no OpenWA)");
  const contato = (d.contact ?? {}) as Record<string, unknown>;
  const nome = ((contato.pushname ?? contato.name ?? contato.shortName) as string | undefined)?.trim() || null;
  const tipoMidia = MIDIA[String(d.type ?? "")];
  const media = d.media as { mimetype?: string; filename?: string } | undefined;
  const midia = tipoMidia ? { tipo: tipoMidia, nome: media?.filename ?? null, mime: media?.mimetype ?? "application/octet-stream" } : null;
  if (!texto && !midia) return ign(`tipo ${String(d.type ?? "?")} sem texto`);
  return { tipo: "privada", chave, sessao, externoId, de, nome, texto, midia };
}

// ---------------------------------------------------------------- envio

export interface ResultadoOpenwa {
  ok: boolean;
  status: number;
  id: string | null;
  erro: string | null;
  corpo?: unknown;
}

export const base = (url: string) => url.replace(/\/+$/, "");

/** Chamada genérica à API (X-API-Key). */
export async function chamarOpenwa(f: Fetch, url: string, chave: string, metodo: string, caminho: string, corpo?: unknown): Promise<ResultadoOpenwa> {
  let r: Response;
  try {
    r = await f(`${base(url)}/api${caminho}`, {
      method: metodo,
      headers: { "X-API-Key": chave, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, status: 0, id: null, erro: err instanceof Error ? `OpenWA sem resposta (${err.name}): ${err.message}` : "OpenWA sem resposta." };
  }
  const texto = await r.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* resposta não-JSON */
  }
  const j = (json ?? {}) as Record<string, unknown>;
  if (!r.ok) {
    const msg = (j.message as string | string[] | undefined) ?? texto.slice(0, 300);
    return { ok: false, status: r.status, id: null, erro: `OpenWA ${r.status}: ${Array.isArray(msg) ? msg.join("; ") : msg}`, corpo: json };
  }
  return { ok: true, status: r.status, id: ((j.messageId ?? j.id) as string | undefined) ?? null, erro: null, corpo: json };
}

/** Destino: telefone vira "<tel>@c.us"; id de grupo/JID passa como está. */
export function chatIdDe(destino: string): string {
  return destino.includes("@") ? destino : `${destino.replace(/\D/g, "")}@c.us`;
}

export function enviarTextoOpenwa(f: Fetch, url: string, chave: string, sessao: string, destino: string, texto: string, citar?: string | null): Promise<ResultadoOpenwa> {
  return chamarOpenwa(f, url, chave, "POST", `/sessions/${encodeURIComponent(sessao)}/messages/send-text`, {
    chatId: chatIdDe(destino),
    text: texto,
    ...(citar ? { quotedMessageId: citar } : {}),
  });
}

/** Mensagem do atendente para o colaborador: "*Wagner (TI):* texto" (o número é do sistema, então o nome vai junto). */
export function comAutor(texto: string, autor: string | null, setor: string | null): string {
  const nome = autor?.trim().split(/\s+/)[0];
  if (!nome) return texto;
  return `*${nome}${setor ? ` (${setor})` : ""}:* ${texto}`;
}
