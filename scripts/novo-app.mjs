#!/usr/bin/env node
// Gera o backend de um aplicativo novo a partir do modelo (supabase/templates).
//
//   npm run novo-app -- <schema> "<Nome do aplicativo>" [--dono email@calper.com.br] [--nome-dono "Nome"] [--saida pasta]
//
// Cria (sem aplicar nada no banco):
//   supabase/migrations/<data>_<schema>_*.sql   schema, tabelas, RPCs e Contrato Calper
//   supabase/functions/<schema>-*/              Edge Functions (usuarios, totvs, integracao-teste) + _shared
//   supabase/config.toml                        verify_jwt das funções
// e ajusta o front: APP_NAME e o schema padrão em src/config/app.ts, título do index.html e package.json.
// Com --saida, grava só o backend na pasta indicada (ensaio) e não mexe no projeto.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODELOS = join(RAIZ, "supabase", "templates");

// Schemas que já existem no Supabase compartilhado da Calper (ou são do próprio Supabase).
const RESERVADOS = new Set([
  "public", "auth", "storage", "vault", "graphql", "graphql_public", "realtime", "extensions", "pgbouncer",
  "supabase_functions", "supabase_migrations", "net", "cron", "pgsodium", "pgsodium_masks",
  "acessos", "comercial", "contratos", "portal_dp", "gestao_financeira", "atendimento", "rh", "cobranca", "financeiro",
]);

function sair(mensagem) {
  console.error(`\n✖ ${mensagem}\n`);
  process.exit(1);
}

function opcao(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const [schema, nome] = process.argv.slice(2).filter((arg, i, todos) => !arg.startsWith("--") && !todos[i - 1]?.startsWith("--"));
if (!schema || !nome) {
  sair('Uso: npm run novo-app -- <schema> "<Nome do aplicativo>" [--dono email@calper.com.br] [--nome-dono "Nome"]');
}
if (!/^[a-z][a-z0-9_]{1,40}$/.test(schema)) sair(`Schema inválido: "${schema}". Use letras minúsculas, números e _ (ex.: compras).`);
if (RESERVADOS.has(schema)) sair(`O schema "${schema}" já existe no Supabase compartilhado (ou é do Supabase). Escolha outro.`);
if (nome.trim().length < 3) sair("Informe o nome do aplicativo (ex.: \"Gestão de Compras\").");

const dono = opcao("--dono", "wagner.antunes@calper.com.br").trim().toLowerCase();
if (!/^[a-z0-9._-]+@calper\.com\.br$/.test(dono)) sair(`O dono precisa ser um e-mail @calper.com.br sem sufixo (+): ${dono}`);
const nomeDono = opcao("--nome-dono", dono === "wagner.antunes@calper.com.br" ? "Wagner Antunes" : dono.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
const saida = opcao("--saida", null);
const destino = saida ? resolve(saida) : join(RAIZ, "supabase");

const sql = (texto) => texto.replace(/'/g, "''");
const preencher = (texto) =>
  texto
    .replaceAll("__APP_NAME__", nome.trim())
    .replaceAll("__OWNER_EMAIL__", sql(dono))
    .replaceAll("__OWNER_NAME__", sql(nomeDono))
    .replaceAll("__APP__", schema);

// ---------- Migrations ----------
const pastaMigrations = join(destino, "migrations");
mkdirSync(pastaMigrations, { recursive: true });
if (readdirSync(pastaMigrations).some((arquivo) => arquivo.includes(`_${schema}_`))) {
  sair(`Já existem migrations do schema "${schema}" em ${pastaMigrations}. Nada foi alterado.`);
}
const agora = new Date();
const dois = (n) => String(n).padStart(2, "0");
const prefixo = `${agora.getUTCFullYear()}${dois(agora.getUTCMonth() + 1)}${dois(agora.getUTCDate())}${dois(agora.getUTCHours())}${dois(agora.getUTCMinutes())}`;
const modelos = readdirSync(join(MODELOS, "migrations")).filter((arquivo) => arquivo.endsWith(".sql")).sort();
modelos.forEach((arquivo, i) => {
  const [, ...resto] = arquivo.replace(/\.sql$/, "").split("_");
  const nomeArquivo = `${prefixo}${dois(i)}_${schema}_${resto.join("_")}.sql`;
  writeFileSync(join(pastaMigrations, nomeArquivo), preencher(readFileSync(join(MODELOS, "migrations", arquivo), "utf8")));
});

// ---------- Edge Functions ----------
const pastaFuncoes = join(destino, "functions");
mkdirSync(pastaFuncoes, { recursive: true });
for (const pasta of readdirSync(join(MODELOS, "functions"))) {
  const alvo = join(pastaFuncoes, preencher(pasta));
  if (existsSync(alvo) && pasta !== "_shared") sair(`A pasta ${alvo} já existe. Nada foi alterado além das migrations.`);
  mkdirSync(alvo, { recursive: true });
  for (const arquivo of readdirSync(join(MODELOS, "functions", pasta))) {
    const origem = join(MODELOS, "functions", pasta, arquivo);
    if (statSync(origem).isFile()) writeFileSync(join(alvo, arquivo), preencher(readFileSync(origem, "utf8")));
  }
}
const config = join(destino, "config.toml");
if (!existsSync(config)) writeFileSync(config, preencher(readFileSync(join(MODELOS, "config.toml"), "utf8")));
else cpSync(join(MODELOS, "config.toml"), join(destino, "config.modelo.toml"));

// ---------- Front (só no projeto, não no ensaio) ----------
if (!saida) {
  const trocar = (arquivo, de, para) => {
    const caminho = join(RAIZ, arquivo);
    const antes = readFileSync(caminho, "utf8");
    const depois = antes.replace(de, para);
    if (antes === depois) console.warn(`  aviso: não achei o trecho a trocar em ${arquivo}`);
    writeFileSync(caminho, depois);
  };
  trocar("src/config/app.ts", /export const APP_NAME = ".*?";/, `export const APP_NAME = ${JSON.stringify(nome.trim())};`);
  trocar("src/config/app.ts", /\|\| "[a-z0-9_]+";/, `|| ${JSON.stringify(schema)};`);
  trocar("index.html", /<title>.*? · Calper<\/title>/, `<title>${nome.trim()} · Calper</title>`);
  trocar("package.json", /"name": ".*?"/, `"name": ${JSON.stringify(schema.replace(/_/g, "-"))}`);
}

console.log(`
✔ Backend do aplicativo "${nome.trim()}" (schema ${schema}) gerado em ${destino}
  Dono (Super admin): ${nomeDono} <${dono}>

Próximos passos:
  1. Revise as migrations em ${pastaMigrations} e aplique na ordem (o schema é criado e exposto na API).
  2. Publique as Edge Functions:
       npx supabase functions deploy ${schema}-usuarios ${schema}-totvs ${schema}-integracao-teste --project-ref cjofyxgcuvpeeslkfawu --use-api
  3. Gere os tipos do schema novo:
       npx supabase gen types typescript --project-id cjofyxgcuvpeeslkfawu --schema ${schema},public > src/lib/database.types.ts
     e, em src/lib/supabase.ts, troque "comercial" por "${schema}" no client e use supabase.schema("public") no central
     (as funções da Central ficam no public; sem ele nos tipos, o build quebra).
  4. .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable) e VITE_APP_SCHEMA=${schema}.
  5. Depois do deploy, o aplicativo aparece sozinho em Configurações › Permissões por aplicativo (Contrato Calper).
`);
