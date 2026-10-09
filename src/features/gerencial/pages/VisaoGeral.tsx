import { AlertTriangle, Lightbulb } from "lucide-react";
import { Link } from "react-router";
import { getMenuItem } from "../../../config/menuRegistry";
import { KpiGer, Secao, Semaforo } from "../componentes";
import { CORES, fmtDia, fmtHoras, fmtNum, fmtPct, GraficoBarras, GraficoDonut, GraficoLinha } from "../graficos";
import { useVisao } from "../hooks";
import { semaforo } from "../calculos";

/** Visão Geral: o essencial do período (KPIs, ritmo, backlog, alertas e insights que mais importam). */
export function VisaoGeral() {
  const v = useVisao();
  const k = v.kpis;
  const a = v.kpisAnterior;
  const base = getMenuItem("gestao_chamados_gerencial").path;
  const ind = Object.fromEntries(v.indicadores.map((i) => [i.chave, i]));
  const status = ["novo", "andamento", "pendente"].map((c) => ({ rotulo: c === "novo" ? "Novo" : c === "andamento" ? "Em andamento" : "Pendente", valor: v.backlog.filter((t) => t.categoriaStatus === c).length }));
  const criticos = v.alertas.filter((x) => x.nivel !== "ok").slice(0, 3);
  const mensalSpark = (f: (m: (typeof v.mensal)[number]) => number | null) => v.mensal.slice(-6).map((m) => f(m) ?? 0);

  return (
    <>
      <div className="ds-kpis">
        <KpiGer label="Entradas" valor={fmtNum(k.entradas)} variacao={ind.taxa_resolucao ? (a.entradas ? Math.round((1000 * (k.entradas - a.entradas)) / a.entradas) / 10 : null) : null} maiorMelhor={false} spark={mensalSpark((m) => m.entradas)} />
        <KpiGer label="Resolvidos" valor={fmtNum(k.resolvidos)} variacao={a.resolvidos ? Math.round((1000 * (k.resolvidos - a.resolvidos)) / a.resolvidos) / 10 : null} maiorMelhor spark={mensalSpark((m) => m.resolvidos)} />
        <KpiGer label="Backlog" valor={fmtNum(k.backlog)} unidade="abertos" tom={ind.backlog.semaforo} variacao={ind.backlog.variacaoPct} maiorMelhor={false} spark={mensalSpark((m) => m.backlogFim)} />
        <KpiGer label="SLA de solução" valor={fmtPct(k.slaSolucaoPct)} tom={ind.sla_solucao.semaforo} variacao={ind.sla_solucao.variacaoPct} maiorMelhor spark={mensalSpark((m) => m.slaSolucaoPct)} />
        <KpiGer label="Tempo médio de resolução" valor={fmtHoras(k.tmrHoras)} tom={ind.tmr.semaforo} variacao={ind.tmr.variacaoPct} maiorMelhor={false} spark={mensalSpark((m) => m.tmrHoras)} />
        <KpiGer label="SLA vencido" valor={fmtNum(k.vencidos)} unidade="abertos" tom={ind.vencidos.semaforo} variacao={ind.vencidos.variacaoPct} maiorMelhor={false} />
      </div>

      <div className="ger-grid ger-grid--21">
        <Secao titulo="Ritmo do período" subtitulo="Tickets que entraram e que foram resolvidos por dia.">
          <GraficoLinha titulo="Entradas e resolvidos por dia" rotulos={v.diaria.map((p) => fmtDia(p.dia))} series={[{ nome: "Entradas", valores: v.diaria.map((p) => p.entradas) }, { nome: "Resolvidos", valores: v.diaria.map((p) => p.resolvidos) }]} formato={(x) => fmtNum(x)} />
        </Secao>
        <Secao titulo="Backlog agora" subtitulo="Abertos por situação.">
          <GraficoDonut titulo="Backlog por situação" itens={status} centro="abertos" />
          <p className="ger-nota">
            Sem responsável: <b>{fmtNum(k.semResponsavel)}</b> · Parados há +{v.metas.parado_dias} dias: <b>{fmtNum(k.parados)}</b> · Mais antigo: <b>{k.maisAntigoDias === null ? "—" : `${k.maisAntigoDias} dias`}</b>
          </p>
        </Secao>
      </div>

      <div className="ger-grid ger-grid--3">
        <Secao titulo="Backlog por equipe" subtitulo="Abertos agora, com os vencidos ao lado.">
          <GraficoBarras titulo="Backlog por equipe" itens={v.grupos.equipe.filter((g) => g.backlog > 0).sort((x, y) => y.backlog - x.backlog).map((g) => ({ rotulo: g.chave, valor: g.backlog, detalhe: g.vencidos ? `${g.vencidos} vencidos` : undefined, cor: g.vencidos > 0 ? CORES[4] : CORES[0] }))} />
        </Secao>
        <Secao titulo="Alertas" subtitulo={criticos.length ? `${criticos.length} limites ultrapassados.` : "Nenhum limite ultrapassado."} aside={<Link className="ds-linkbtn" to={{ pathname: `${base}/alertas`, search: location.search }}>Ver todos →</Link>}>
          <div className="ger-lista">
            {criticos.length === 0 && <p className="gr-vazio">Tudo dentro dos limites definidos em Indicadores.</p>}
            {criticos.map((al) => (
              <div key={al.id} className={`ger-item ger-item--${al.nivel}`}>
                <span className="ger-item__icone"><AlertTriangle size={16} aria-hidden="true" /></span>
                <div>
                  <b>{al.titulo}</b>
                  <p>{al.texto}</p>
                </div>
                <Semaforo tom={al.nivel === "critico" ? "vermelho" : "amarelo"} />
              </div>
            ))}
          </div>
        </Secao>
        <Secao titulo="Insights" subtitulo="O que os dados estão dizendo." aside={<Link className="ds-linkbtn" to={{ pathname: `${base}/insights`, search: location.search }}>Ver todos →</Link>}>
          <div className="ger-lista">
            {v.insights.length === 0 && <p className="gr-vazio">Nenhum padrão fora do comum neste recorte.</p>}
            {v.insights.slice(0, 3).map((i) => (
              <div key={i.titulo} className={`ger-item ger-item--${i.tipo}`}>
                <span className="ger-item__icone"><Lightbulb size={16} aria-hidden="true" /></span>
                <div>
                  <b>{i.titulo}</b>
                  <p>{i.texto}</p>
                </div>
                <span className="ger-item__lado">{i.tipo}</span>
              </div>
            ))}
          </div>
        </Secao>
      </div>

      <Secao titulo="Metas do período" subtitulo="Semáforo de cada indicador; limites em Indicadores.">
        <div className="ger-acoes">
          {v.indicadores.map((i) => (
            <Semaforo key={i.chave} tom={semaforo(i.valor, i.meta, i.maiorMelhor)}>
              {i.label}: {i.valor === null ? "—" : `${fmtNum(i.valor, i.unidade === "h" ? 1 : 0)}${i.unidade === "%" ? "%" : i.unidade === "h" ? " h" : ""}`} / {i.meta}{i.unidade === "%" ? "%" : i.unidade === "h" ? " h" : ""}
            </Semaforo>
          ))}
        </div>
      </Secao>
    </>
  );
}
