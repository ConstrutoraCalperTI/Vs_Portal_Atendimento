// Gera src/features/calperdesk/iconesSetor.data.ts com os ícones coloridos dos departamentos do CalperDESK, embutidos
// no bundle: o <Icon> do Iconify buscaria na api.iconify.design, que a CSP do portal (connect-src) bloqueia.
// Para incluir um ícone: some na lista abaixo e rode `npm run icones:setor`.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ICONES = [
  ["flat-color-icons:folder", "Pasta (padrão)"],
  ["fluent-color:people-team-24", "Equipe"],
  ["flat-color-icons:customer-support", "Suporte"],
  ["fluent-color:code-block-24", "Sistemas / TI"],
  ["flat-color-icons:settings", "Configurações"],
  ["flat-color-icons:multiple-cameras", "CFTV / Câmeras"],
  ["fluent-color:video-24", "Vídeo"],
  ["flat-color-icons:money-transfer", "Financeiro"],
  ["flat-color-icons:calculator", "Contabilidade / Fiscal"],
  ["flat-color-icons:briefcase", "Administrativo"],
  ["flat-color-icons:businessman", "Gestão"],
  ["flat-color-icons:manager", "Diretoria"],
  ["flat-color-icons:document", "Contratos"],
  ["fluent-color:document-text-24", "Documentos"],
  ["flat-color-icons:sales-performance", "Comercial"],
  ["flat-color-icons:shop", "Loja / Vendas"],
  ["flat-color-icons:engineering", "Engenharia"],
  ["flat-color-icons:factory", "Obra"],
  ["fluent-color:building-24", "Prédio"],
  ["fluent-color:building-home-24", "Empreendimento"],
  ["flat-color-icons:home", "Casa"],
  ["fluent-color:wrench-screwdriver-24", "Manutenção"],
  ["fluent-color:toolbox-24", "Assistência técnica"],
  ["fluent-color:shield-checkmark-24", "Compliance / Segurança"],
  ["flat-color-icons:lock", "Acessos"],
  ["flat-color-icons:package", "Suprimentos"],
  ["fluent-color:clipboard-task-24", "Tarefas"],
  ["fluent-color:calendar-24", "Agenda"],
  ["fluent-color:mail-24", "E-mail"],
  ["fluent-color:chat-24", "Atendimento"],
  ["flat-color-icons:phone", "Telefone"],
  ["fluent-color:people-community-24", "RH / Pessoas"],
  ["fluent-color:building-government-24", "Jurídico"],
  ["flat-color-icons:statistics", "Indicadores"],
  ["flat-color-icons:idea", "Ideias / Projetos"],
];

const colecoes = new Map();
const dados = ICONES.map(([nome, rotulo]) => {
  const [prefixo, icone] = nome.split(":");
  if (!colecoes.has(prefixo)) colecoes.set(prefixo, JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefixo}/icons.json`), "utf8")));
  const c = colecoes.get(prefixo);
  const i = c.icons[icone];
  if (!i) throw new Error(`Ícone não existe: ${nome}`);
  return { nome, rotulo, data: { body: i.body, width: i.width ?? c.width ?? 16, height: i.height ?? c.height ?? 16 } };
});

const saida = `// Gerado por scripts/gerar-icones-setor.mjs (npm run icones:setor). Não edite à mão.
import type { IconifyIcon } from "@iconify/react";

export const ICONES_SETOR: { nome: string; rotulo: string; data: IconifyIcon }[] = ${JSON.stringify(dados, null, 2)};
`;
writeFileSync(new URL("../src/features/calperdesk/iconesSetor.data.ts", import.meta.url), saida);
console.log(`${dados.length} ícones gravados.`);
