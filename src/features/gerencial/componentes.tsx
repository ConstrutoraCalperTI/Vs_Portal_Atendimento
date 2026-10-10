import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Panel } from "../../components/ds/Panel";
import { iconeDe, type Tema } from "./icones";
// O Panel vem direto do arquivo (sem o índice do design system), então os estilos .ds-* precisam ser carregados
// aqui; sem isso, abrir o Gerencial antes da Visão geral deixava os cards de KPI um embaixo do outro.
import "../../components/ds/ds.css";
import "../../components/ds/components.css";
import { fmtNum, fmtPct, Sparkline } from "./graficos";
import type { Semaforo as Tom } from "./types";

// Peças compartilhadas pelas telas do Gerencial: KPI com semáforo, variação, tabela ordenável, seção.

export const TOM_ROTULO: Record<Tom, string> = { verde: "Na meta", amarelo: "Atenção", vermelho: "Fora da meta", cinza: "Sem dados" };

export function Semaforo({ tom, children }: { tom: Tom; children?: ReactNode }) {
  return <span className={`ger-sem ger-sem--${tom}`}>{children ?? TOM_ROTULO[tom]}</span>;
}

/** Variação em relação ao período anterior; a cor diz se melhorou, não se subiu. */
export function Variacao({ pct, maiorMelhor, sufixo = "vs. anterior" }: { pct: number | null; maiorMelhor: boolean; sufixo?: string }) {
  if (pct === null) return <span className="ger-var">— {sufixo}</span>;
  const melhorou = pct === 0 ? null : maiorMelhor ? pct > 0 : pct < 0;
  const Icone = pct === 0 ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`ger-var${melhorou === null ? "" : melhorou ? " ger-var--bom" : " ger-var--ruim"}`}>
      <Icone size={13} aria-hidden="true" />
      {pct > 0 ? "+" : ""}
      {fmtNum(pct, 1)}% {sufixo}
    </span>
  );
}

/** Ícone num quadradinho colorido (o tema vem do assunto, ver icones.ts). */
export function IconeTema({ icone: Icone, tema, tamanho = 15 }: { icone: LucideIcon; tema: Tema; tamanho?: number }) {
  return (
    <span className={`ger-ico ger-ico--${tema}`} aria-hidden="true">
      <Icone size={tamanho} strokeWidth={2.2} />
    </span>
  );
}

interface KpiGerProps {
  label: string;
  valor: string;
  unidade?: string;
  hint?: string;
  tom?: Tom;
  variacao?: number | null;
  maiorMelhor?: boolean;
  spark?: number[];
  /** Ícone do card; sem ele, vem do assunto do rótulo. */
  icone?: LucideIcon;
}

export function KpiGer({ label, valor, unidade, hint, tom, variacao, maiorMelhor = true, spark, icone }: KpiGerProps) {
  const auto = iconeDe(label);
  return (
    <div className={`ger-kpi${tom ? ` ger-kpi--${tom}` : ""}`} title={hint && variacao !== undefined ? hint : undefined}>
      <div className="ger-kpi__topo">
        <span className="ger-kpi__rotulo">
          <IconeTema icone={icone ?? auto.icone} tema={auto.tema} tamanho={13} />
          <span>{label}</span>
        </span>
        {tom && <Semaforo tom={tom} />}
      </div>
      <strong className="ger-kpi__valor">
        {valor}
        {unidade && <small>{unidade}</small>}
      </strong>
      <div className="ger-kpi__rodape">
        {variacao !== undefined ? <Variacao pct={variacao} maiorMelhor={maiorMelhor} /> : <span>{hint}</span>}
        {spark && <Sparkline valores={spark} />}
      </div>
    </div>
  );
}

interface SecaoProps {
  titulo: string;
  subtitulo?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Ícone do título; sem ele, vem do assunto do título. */
  icone?: LucideIcon;
}

export function Secao({ titulo, subtitulo, aside, children, className, icone }: SecaoProps) {
  const id = useId();
  const auto = iconeDe(titulo);
  return (
    <Panel aria-labelledby={id} className={["ger-panel", className].filter(Boolean).join(" ")}>
      <div className="ger-panel__head">
        <IconeTema icone={icone ?? auto.icone} tema={auto.tema} tamanho={16} />
        <div className="ger-panel__textos">
          <h2 className="ds-h2" id={id}>
            {titulo}
          </h2>
          {subtitulo && <p className="ds-subtitle">{subtitulo}</p>}
        </div>
        {aside && <div className="ger-panel__aside">{aside}</div>}
      </div>
      {children}
    </Panel>
  );
}

export interface Coluna<T> {
  chave: string;
  label: string;
  num?: boolean;
  valor: (linha: T) => string | number | null;
  render?: (linha: T) => ReactNode;
}

interface TabelaProps<T> {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  ordemInicial?: { chave: string; desc?: boolean };
  totais?: Partial<Record<string, string | number>>;
  vazio?: string;
  limite?: number;
}

/** Tabela ordenável por clique no cabeçalho; números alinhados à direita e com rodapé de totais opcional. */
export function Tabela<T>({ colunas, linhas, chave, ordemInicial, totais, vazio = "Sem dados no período.", limite }: TabelaProps<T>) {
  const [ordem, setOrdem] = useState(ordemInicial ?? { chave: colunas[0].chave, desc: false });
  const col = colunas.find((c) => c.chave === ordem.chave) ?? colunas[0];
  const ordenadas = [...linhas].sort((a, b) => {
    const va = col.valor(a);
    const vb = col.valor(b);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
    return ordem.desc ? -r : r;
  });
  const visiveis = limite ? ordenadas.slice(0, limite) : ordenadas;
  const formatar = (v: string | number | null) => (typeof v === "number" ? fmtNum(v, Number.isInteger(v) ? 0 : 1) : (v ?? "—"));
  return (
    <div className="ger-tabela__rolagem">
      <table className="ger-tabela">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.chave} className={c.num ? "num" : undefined} aria-sort={ordem.chave === c.chave ? (ordem.desc ? "descending" : "ascending") : undefined}>
                <button type="button" className="ger-ordenar" onClick={() => setOrdem({ chave: c.chave, desc: ordem.chave === c.chave ? !ordem.desc : Boolean(c.num) })}>
                  {c.label}
                  {ordem.chave === c.chave ? (ordem.desc ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={colunas.length} className="gr-vazio">{vazio}</td>
            </tr>
          )}
          {visiveis.map((l) => (
            <tr key={chave(l)}>
              {colunas.map((c) => (
                <td key={c.chave} className={c.num ? "num" : undefined}>{c.render ? c.render(l) : formatar(c.valor(l))}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {totais && (
          <tfoot>
            <tr>
              {colunas.map((c, i) => (
                <td key={c.chave} className={c.num ? "num" : undefined}>{i === 0 ? "Total" : (totais[c.chave] !== undefined ? formatar(totais[c.chave] as string | number) : "")}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {limite && ordenadas.length > limite && <p className="ger-nota">Mostrando {limite} de {ordenadas.length}. Exporte em Exportações para ver tudo.</p>}
    </div>
  );
}

export const pctTexto = (v: number | null) => fmtPct(v);
