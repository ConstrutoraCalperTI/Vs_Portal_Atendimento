// Leitura dos empreendimentos do site www.calper.com.br (WordPress, página /empreendimentos-2/), sem dependências:
// roda na Edge Function e nos testes. Cada empreendimento é um <article class="card"> com foto (data-src, lazyload),
// nome em <strong>, "Tipo<br>Bairro" no <p> e o link da página. Mudou o layout → lista vazia (o cache segura a última).

export const URL_EMPREENDIMENTOS = "https://www.calper.com.br/empreendimentos-2/";
const ORIGEM = "https://www.calper.com.br/";

export interface Empreendimento {
  nome: string;
  /** "Residencial · Recreio dos Bandeirantes" (o que o site mostra abaixo do nome). */
  info: string;
  imagem: string | null;
  link: string;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#039": "'" };

function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

const semTags = (s: string) => decodificar(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const doSite = (u: string | undefined) => (u && u.startsWith(ORIGEM) ? u : null);

export function lerEmpreendimentos(html: string, limite = 40): Empreendimento[] {
  const vistos = new Set<string>();
  const lista: Empreendimento[] = [];
  for (const card of html.match(/<article class="card"[\s\S]*?<\/article>/g) ?? []) {
    const link = doSite(card.match(/href="([^"]+)"/)?.[1]);
    const nome = semTags(card.match(/<strong[^>]*>([\s\S]*?)<\/strong>/)?.[1] ?? "");
    if (!link || !nome || vistos.has(link)) continue;
    vistos.add(link);
    const p = card.match(/text--14[^>]*>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? "";
    const info = semTags(p.replace(/<br\s*\/?>/gi, " · ")).replace(/^·\s*|\s*·$/g, "");
    lista.push({
      nome: nome.slice(0, 80),
      // Descrição longa (ex.: Cidade Arte) não cabe no cartão: corta na palavra.
      info: info.length > 90 ? `${info.slice(0, 87).replace(/\s+\S*$/, "")}…` : info,
      imagem: doSite(card.match(/data-src="([^"]+)"/)?.[1] ?? card.match(/<img[^>]+src="(https:[^"]+)"/)?.[1]),
      link,
    });
    if (lista.length >= limite) break;
  }
  return lista;
}
