// Webhook da Zenvia (assinaturas MESSAGE e MESSAGE_STATUS), um para os números de todos os setores.
// Chamado pela Zenvia, sem JWT: a autenticação é o cabeçalho x-atendimento-chave (chave no Vault).
//
// F3 (06/10/2026): grava o evento cru em at_eventos_zenvia (idempotente por tipo + id da Zenvia) e atualiza
// o status das mensagens enviadas. Abrir a conversa no setor do número de destino, pôr na fila e mandar a
// mensagem automática é a fase do chat.

import { createClient } from "npm:@supabase/supabase-js@2";
import { lerEvento } from "../_shared/atendimento/zenvia.ts";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** Compara sem atalho (tempo constante para tamanhos iguais). */
function iguais(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "Método não suportado." });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return resposta(500, { erro: "Função sem configuração do Supabase." });
  const db = createClient(url, key, { db: { schema: "portal_atendimento" }, auth: { persistSession: false, autoRefreshToken: false } });

  const cred = await db.rpc("at_ler_credencial_zenvia");
  const chave = (cred.data as { webhook_chave: string | null }[] | null)?.[0]?.webhook_chave ?? "";
  if (!iguais(req.headers.get("x-atendimento-chave") ?? "", chave)) return resposta(401, { erro: "Chave inválida." });

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") return resposta(400, { erro: "Corpo inválido." });
  const evento = lerEvento(payload);
  const p = payload as Record<string, unknown>;
  const m = (p.message ?? {}) as Record<string, unknown>;

  const zenviaId = evento.tipo === "ignorado" ? (String(p.messageId ?? m.id ?? p.id ?? "") || null) : evento.zenviaId || null;
  const ins = await db.from("at_eventos_zenvia").insert({
    tipo: String(p.type ?? "?"),
    zenvia_id: zenviaId,
    para: evento.tipo === "mensagem" ? evento.para.replace(/\D/g, "") : null,
    payload,
    processado: evento.tipo !== "mensagem",
    erro: evento.tipo === "ignorado" ? evento.motivo : null,
  });
  // 23505 = a Zenvia reenviou o mesmo evento: já foi gravado.
  if (ins.error && ins.error.code !== "23505") {
    console.error(JSON.stringify({ evento: "atendimento.webhook_falhou", erro: ins.error.message }));
    return resposta(500, { erro: "Falha ao gravar o evento." });
  }

  if (evento.tipo === "status") {
    await db.from("at_mensagens").update({ status: evento.status, erro: evento.erro }).eq("zenvia_id", evento.zenviaId);
  }
  return resposta(200, { ok: true, duplicado: ins.error?.code === "23505" });
});
