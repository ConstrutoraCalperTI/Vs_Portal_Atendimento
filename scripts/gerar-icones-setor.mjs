// Gera iconesSetor.data.ts (departamentos do CalperDESK) e iconesMenu.data.ts (menu lateral) com os ícones coloridos, embutidos
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

// Menu lateral do portal (Sidebar): ícone colorido de cada item de 1º nível, pelo id do menuRegistry.
const MENU = [
  ["home", "fluent-color:home-24"],
  ["gestao_chamados", "fluent-color:clipboard-task-24"],
  ["gestao_movidesk", "fluent-color:book-database-24"],
  ["gestao_atendimento", "fluent-color:apps-24"],
  ["configuracoes", "fluent-color:settings-24"],
];

const colecoes = new Map();
const dadosDe = (nome) => {
  const [prefixo, icone] = nome.split(":");
  if (!colecoes.has(prefixo)) colecoes.set(prefixo, JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefixo}/icons.json`), "utf8")));
  const c = colecoes.get(prefixo);
  const i = c.icons[icone];
  if (!i) throw new Error(`Ícone não existe: ${nome}`);
  return { body: i.body, width: i.width ?? c.width ?? 16, height: i.height ?? c.height ?? 16 };
};
const dados = ICONES.map(([nome, rotulo]) => ({ nome, rotulo, data: dadosDe(nome) }));

const saida = `// Gerado por scripts/gerar-icones-setor.mjs (npm run icones:setor). Não edite à mão.
import type { IconifyIcon } from "@iconify/react";

export const ICONES_SETOR: { nome: string; rotulo: string; data: IconifyIcon }[] = ${JSON.stringify(dados, null, 2)};
`;
writeFileSync(new URL("../src/features/calperdesk/iconesSetor.data.ts", import.meta.url), saida);

const menu = MENU.map(([id, nome]) => ({ id, nome, data: dadosDe(nome) }));
writeFileSync(new URL("../src/components/iconesMenu.data.ts", import.meta.url), `// Gerado por scripts/gerar-icones-setor.mjs (npm run icones:setor). Não edite à mão.
import type { IconifyIcon } from "@iconify/react";

/** Ícone colorido do item de 1º nível do menu lateral, pelo id do menuRegistry. */
export const ICONES_MENU: Record<string, { nome: string; data: IconifyIcon }> = ${JSON.stringify(Object.fromEntries(menu.map((m) => [m.id, { nome: m.nome, data: m.data }])), null, 2)};
`);
console.log(`${dados.length} ícones de setor e ${menu.length} do menu gravados.`);
