import { Activity, AlertTriangle, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { resumoParaIa } from "../calculos";
import { Secao, Semaforo } from "../componentes";
import { CORES, fmtHoras, fmtNum, fmtPct, GraficoBarras } from "../graficos";
import { useRecomendacoesIa, useVisao } from "../hooks";
import { ServiceError } from "../../configuracoes/services/types";
import type { Insight } from "../types";

const TIPOS: Record<Insight["tipo"], { label: string; icone: typeof Lightbulb; descricao: string }> = {
  anomalia: { label: "Anomalias", icone: Activity, descricao: "Dias fora do padrão." },
  tendencia: { label: "Tendências", icone: TrendingUp, descricao: "Movimentos de meses seguidos." },
  risco: { label: "Riscos", icone: AlertTriangle, descricao: "O que pode virar atraso ou meta perdida." },
  oportunidade: { label: "Oportunidades", icone: Lightbulb, descricao: "Onde uma ação pequena rende mais." },
};

/** Insights: identificar oportunidades (regras sobre os dados) e recomendações por IA (causa provável, previsão e decisão). */
export function Insights() {
  const v = useVisao();
  const ia = useRecomendacoesIa();
  const equipesSla = v.grupos.equipe.filter((g) => g.resolvidos > 0).sort((a, b) => (b.slaSolucaoPct ?? -1) - (a.slaSolucaoPct ?? -1));
  const servicosVolume = v.grupos.servico.slice(0, 8);
  const agentes = v.produtividade.slice(0, 8);

  return (
    <>
      <Secao titulo="Recomendações por IA" subtitulo="A IA recebe só os números agregados deste recorte (sem nomes de solicitantes nem textos de tickets) e devolve causas prováveis, previsão e a decisão sugerida." className="ger-nao-imprime-nao">
        <div className="ger-ia">
          <div className="ger-acoes">
            <button type="button" className="btn btn--primary" disabled={ia.isPending} onClick={() => ia.mutate(resumoParaIa({ periodo: v.filtros, atual: v.kpis, anterior: v.kpisAnterior, porEquipe: v.grupos.equipe, porServico: v.grupos.servico, porOrigem: v.grupos.origem, mensal: v.mensal, alertas: v.alertas, insights: v.insights }))}>
              <Sparkles size={16} aria-hidden="true" /> {ia.isPending ? "Analisando…" : ia.data ? "Gerar de novo" : "Gerar recomendações"}
            </button>
            {ia.data && <span className="ds-muted" style={{ fontSize: 12 }}>Modelo: {ia.data.modelo}</span>}
          </div>
          {ia.isError && <p className="ger-nota" role="alert">{ia.error instanceof ServiceError ? ia.error.message : "Não foi possível falar com a IA. Tente de novo."}</p>}
          {ia.data && (
            <div style={{ marginTop: 12 }}>
              <h3>Resumo executivo</h3>
              <p style={{ margin: "0 0 12px", fontSize: 14 }}>{ia.data.resumoExecutivo}</p>
              <div className="ger-lista">
                {ia.data.recomendacoes.map((r) => (
                  <div key={r.titulo} className={`ger-item ger-item--${r.prioridade === "alta" ? "risco" : r.prioridade === "media" ? "tendencia" : "oportunidade"}`}>
                    <span className="ger-item__icone"><Sparkles size={16} aria-hidden="true" /></span>
                    <div>
                      <b>{r.titulo}</b>
                      <p><b>Causa provável:</b> {r.causaProvavel}</p>
                      <p><b>Previsão:</b> {r.previsao}</p>
                      <p><b>Recomendação:</b> {r.recomendacao}</p>
                    </div>
                    <Semaforo tom={r.prioridade === "alta" ? "vermelho" : r.prioridade === "media" ? "amarelo" : "verde"}>Prioridade {r.prioridade}</Semaforo>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Secao>

      {(Object.keys(TIPOS) as Insight["tipo"][]).map((tipo) => {
        const lista = v.insights.filter((i) => i.tipo === tipo);
        const T = TIPOS[tipo];
        return (
          <Secao key={tipo} titulo={T.label} subtitulo={T.descricao}>
            <div className="ger-lista">
              {lista.length === 0 && <p className="gr-vazio">Nada a destacar neste recorte.</p>}
              {lista.map((i) => (
                <div key={i.titulo} className={`ger-item ger-item--${i.tipo}`}>
                  <span className="ger-item__icone"><T.icone size={16} aria-hidden="true" /></span>
                  <div>
                    <b>{i.titulo}</b>
                    <p>{i.texto}</p>
                    <small>Evidência: {i.evidencia}</small>
                  </div>
                </div>
              ))}
            </div>
          </Secao>
        );
      })}

      <div className="ger-grid ger-grid--3">
        <Secao titulo="Ranking: equipes por SLA" subtitulo="Resolvidos no prazo, no período.">
          <GraficoBarras titulo="SLA por equipe" itens={equipesSla.map((g, i) => ({ rotulo: g.chave, valor: g.slaSolucaoPct ?? 0, detalhe: `${g.resolvidos} resolvidos`, cor: i === 0 ? CORES[1] : CORES[0] }))} formato={(x) => fmtPct(x)} max={100} />
        </Secao>
        <Secao titulo="Ranking: agentes por resolvidos" subtitulo="Com o tempo médio ao lado.">
          <GraficoBarras titulo="Resolvidos por agente" itens={agentes.map((p, i) => ({ rotulo: p.responsavel, valor: p.resolvidos, detalhe: fmtHoras(p.tmrHoras), cor: i === 0 ? CORES[1] : CORES[0] }))} />
        </Secao>
        <Secao titulo="Ranking: serviços por volume" subtitulo="Entradas no período.">
          <GraficoBarras titulo="Entradas por serviço" itens={servicosVolume.map((g) => ({ rotulo: g.chave, valor: g.entradas, detalhe: `${fmtNum(g.backlog)} abertos` }))} />
        </Secao>
      </div>
    </>
  );
}
