// Edge Function portal_atendimento-calper-site: empreendimentos do site www.calper.com.br para o CalperDESK
// (carrossel da página inicial e tela Avisos quando não há aviso).
//
//   POST {}  → 200 { itens: Empreendimento[], atualizadoEm, doCache }
//
// Qualquer @calper.com.br logado (portalContext). Lê o cache (cd_empreendimentos_cache); com mais de 6 h, busca a
// página do site de novo (8 s no máximo) e grava. Site fora do ar ou layout mudado: devolve a última leitura boa.
import { corsHeaders, errorResponse, json, portalContext, type AdminClient } from "../_shared/portal.ts";
import { lerEmpreendimentos, URL_EMPREENDIMENTOS, type Empreendimento } from "../_shared/calperSite.ts";

const VALIDADE_MS = 6 * 60 * 60 * 1000;

interface Cache {
  itens: Empreendimento[];
  atualizadoEm: string | null;
  erro: string | null;
}

async function lerCache(admin: AdminClient): Promise<Cache> {
  const { data, error } = await admin.rpc("cd_empreendimentos_ler");
  if (error || !data) return { itens: [], atualizadoEm: null, erro: null };
  return data as Cache;
}

async function buscarSite(): Promise<{ itens: Empreendimento[]; erro: string | null }> {
  try {
    const r = await fetch(URL_EMPREENDIMENTOS, {
      headers: { "User-Agent": "CalperDESK/1.0 (+portal de atendimento Calper)", Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { itens: [], erro: `Site respondeu ${r.status}.` };
    const itens = lerEmpreendimentos(await r.text());
    return { itens, erro: itens.length ? null : "Nenhum empreendimento encontrado na página (o layout do site mudou?)." };
  } catch (e) {
    return { itens: [], erro: e instanceof Error && e.name === "TimeoutError" ? "O site demorou a responder." : "Não foi possível acessar o site." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await portalContext(req);
    const cache = await lerCache(admin);
    const idade = cache.atualizadoEm ? Date.now() - Date.parse(cache.atualizadoEm) : Infinity;
    if (cache.itens.length > 0 && idade < VALIDADE_MS) return json({ itens: cache.itens, atualizadoEm: cache.atualizadoEm, doCache: true });

    const novo = await buscarSite();
    await admin.rpc("cd_empreendimentos_gravar", { p_itens: novo.itens, p_erro: novo.erro });
    if (novo.itens.length > 0) return json({ itens: novo.itens, atualizadoEm: new Date().toISOString(), doCache: false });
    if (novo.erro) console.error(JSON.stringify({ fn: "portal_atendimento-calper-site", erro: novo.erro }));
    return json({ itens: cache.itens, atualizadoEm: cache.atualizadoEm, doCache: true });
  } catch (error) {
    return errorResponse(error);
  }
});
