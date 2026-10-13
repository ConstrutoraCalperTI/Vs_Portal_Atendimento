// Fotos dos empreendimentos para o CalperDESK (pedido do Wagner, 10/10/2026).
//
//   npm run fotos:empreendimentos
//
// Lê https://www.calper.com.br/empreendimentos-2/ (o mesmo leitor da Edge, _shared/calperSite.ts), baixa a foto de cada
// empreendimento e grava public/empreendimentos/<slug>.webp com 960 px de largura (~100 KB). O app usa essa cópia (mesmo
// endereço do portal: carrega rápido no celular e não depende da proteção de hotlink nem da CSP); empreendimento novo,
// sem cópia ainda, cai na foto do site. Rode de novo quando o site ganhar empreendimento e faça o commit das fotos.
// As originais do site têm de 0,5 a 7 MB (uma tem 4000 px): o carrossel troca a cada 6 s e no celular não dava tempo.
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { lerEmpreendimentos, URL_EMPREENDIMENTOS } from "../supabase/functions/_shared/calperSite.ts";

const DESTINO = join(import.meta.dirname, "..", "public", "empreendimentos");
const LARGURA = 960;
const UA = "Mozilla/5.0 (CalperDESK; fotos dos empreendimentos)";

export const slugDoLink = (link) => link.replace(/\/+$/, "").split("/").pop();

mkdirSync(DESTINO, { recursive: true });
const html = await (await fetch(URL_EMPREENDIMENTOS, { headers: { "User-Agent": UA } })).text();
const lista = lerEmpreendimentos(html, 200);
if (lista.length === 0) throw new Error("Nenhum empreendimento lido da página (o layout do site mudou?).");

let ok = 0;
for (const e of lista) {
  const slug = slugDoLink(e.link);
  if (!e.imagem || !/^[a-z0-9-]+$/.test(slug)) {
    console.log(`-  ${e.nome}: sem foto`);
    continue;
  }
  try {
    const r = await fetch(e.imagem, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const original = Buffer.from(await r.arrayBuffer());
    const arquivo = join(DESTINO, `${slug}.webp`);
    await sharp(original).rotate().resize({ width: LARGURA, withoutEnlargement: true }).webp({ quality: 72 }).toFile(arquivo);
    ok++;
    console.log(`ok ${slug}.webp  ${(original.length / 1024).toFixed(0)} KB → ${(statSync(arquivo).size / 1024).toFixed(0)} KB`);
  } catch (erro) {
    console.log(`x  ${e.nome}: ${erro instanceof Error ? erro.message : erro}`);
  }
}
console.log(`\n${ok} de ${lista.length} fotos em public/empreendimentos/ (${readdirSync(DESTINO).length} arquivos na pasta).`);
