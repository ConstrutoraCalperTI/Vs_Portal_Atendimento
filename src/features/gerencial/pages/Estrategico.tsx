import { Printer } from "lucide-react";
import { variacaoPct } from "../calculos";
import { KpiGer, Secao, Semaforo, Variacao } from "../componentes";
import { imprimir } from "../exportar";
import { fmtHoras, fmtNum, fmtPct, GraficoBarras, GraficoColunas, GraficoDonut, GraficoLinha, Medidor } from "../graficos";
import { useVisao } from "../hooks";

/** Estratégico: apoiar decisões (tendência de 13 meses, crescimento, mix, metas e resumo executivo). */
export function Estrategico() {
  const v = useVisao();
  const m = v.mensal;
  const atual = m[m.length - 1];
  const anterior = m[m.length - 2];
  const anoPassado = m[m.length - 13];
  const ult3 = m.slice(-3);
  const ant3 = m.slice(-6, -3);
  const soma = (l: typeof m, f: (p: (typeof m)[number]) => number) => l.reduce((s, p) => s + f(p), 0);
  const cresc3m = variacaoPct(soma(ult3, (p) => p.entradas), soma(ant3, (p) => p.entradas));
  const criticos = v.alertas.filter((a) => a.nivel === "critico");
  const atencao = v.alertas.filter((a) => a.nivel === "atencao");
  const decisoes = v.insights.filter((i) => i.tipo === "risco" || i.tipo === "oportunidade").slice(0, 4);

  return (
    <>
      <div className="ger-acoes ger-nao-imprime" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" className="btn btn--outline" onClick={imprimir}>
          <Printer size={16} aria-hidden="true" /> Relatório executivo (PDF)
        </button>
      </div>

      <div className="ds-kpis">
        <KpiGer label={`Entradas em ${atual?.rotulo ?? "—"}`} valor={fmtNum(atual?.entradas ?? 0)} variacao={variacaoPct(atual?.entradas ?? null, anterior?.entradas ?? null)} maiorMelhor={false} />
        <KpiGer label="Mês × mesmo mês do ano anterior" valor={fmtNum(atual?.entradas ?? 0)} variacao={variacaoPct(atual?.entradas ?? null, anoPassado?.entradas ?? null)} maiorMelhor={false} />
        <KpiGer label="Último trimestre × anterior" valor={fmtNum(soma(ult3, (p) => p.entradas))} variacao={cresc3m} maiorMelhor={false} />
        <KpiGer label="Backlog no fim do mês" valor={fmtNum(atual?.backlogFim ?? 0)} variacao={variacaoPct(atual?.backlogFim ?? null, anterior?.backlogFim ?? null)} maiorMelhor={false} />
        <KpiGer label="SLA de solução no mês" valor={fmtPct(atual?.slaSolucaoPct)} variacao={variacaoPct(atual?.slaSolucaoPct ?? null, anterior?.slaSolucaoPct ?? null)} maiorMelhor />
        <KpiGer label="TMR no mês" valor={fmtHoras(atual?.tmrHoras)} variacao={variacaoPct(atual?.tmrHoras ?? null, anterior?.tmrHoras ?? null)} maiorMelhor={false} />
      </div>

      <div className="ger-grid ger-grid--2">
        <Secao titulo="Demanda × capacidade (13 meses)" subtitulo="Entradas e resolvidos por mês. Quando as linhas se cruzam, o backlog muda de direção.">
          <GraficoLinha titulo="Entradas e resolvidos por mês" rotulos={m.map((p) => p.rotulo)} series={[{ nome: "Entradas", valores: m.map((p) => p.entradas) }, { nome: "Resolvidos", valores: m.map((p) => p.resolvidos) }]} formato={(x) => fmtNum(x)} />
        </Secao>
        <Secao titulo="Backlog no fim de cada mês" subtitulo="O que sobrou aberto quando o mês virou.">
          <GraficoColunas titulo="Backlog no fim do mês" rotulos={m.map((p) => p.rotulo)} series={[{ nome: "Backlog", valores: m.map((p) => p.backlogFim) }]} rotulosDiretos />
        </Secao>
      </div>

      <div className="ger-grid ger-grid--2">
        <Secao titulo="SLA de solução por mês" subtitulo={`Meta: ${v.metas.sla_solucao_pct}%.`}>
          <GraficoLinha titulo="SLA de solução por mês" rotulos={m.map((p) => p.rotulo)} series={[{ nome: "SLA solução", valores: m.map((p) => p.slaSolucaoPct ?? NaN) }, { nome: "Meta", valores: m.map(() => v.metas.sla_solucao_pct), tracejada: true }]} formato={(x) => fmtPct(x)} />
        </Secao>
        <Secao titulo="Tempo médio de resolução por mês" subtitulo={`Meta: ${v.metas.tmr_horas} h.`}>
          <GraficoLinha titulo="TMR por mês" rotulos={m.map((p) => p.rotulo)} series={[{ nome: "TMR (h)", valores: m.map((p) => (p.tmrHoras === null ? NaN : Math.round(p.tmrHoras * 10) / 10)) }, { nome: "Meta", valores: m.map(() => v.metas.tmr_horas), tracejada: true }]} formato={(x) => fmtHoras(x)} />
        </Secao>
      </div>

      <div className="ger-grid ger-grid--3">
        <Secao titulo="Mix por canal" subtitulo="Por onde a demanda chega no período.">
          <GraficoDonut titulo="Entradas por canal" itens={v.grupos.origem.map((g) => ({ rotulo: g.chave, valor: g.entradas }))} centro="entradas" />
        </Secao>
        <Secao titulo="Demanda por setor" subtitulo="Entradas no período.">
          <GraficoBarras titulo="Entradas por setor" itens={v.grupos.setor.map((g) => ({ rotulo: g.chave, valor: g.entradas, detalhe: `${fmtPct(g.slaSolucaoPct)} no prazo` }))} />
        </Secao>
        <Secao titulo="Atingimento das metas" subtitulo="100% = na meta.">
          <div className="ger-lista">
            {v.indicadores.map((i) => (
              <div key={i.chave}>
                <div className="ds-row" style={{ fontSize: 13, marginBottom: 4 }}>
                  <span>{i.label}</span>
                  <Semaforo tom={i.semaforo}>{i.atingimentoPct === null ? "—" : `${i.atingimentoPct}%`}</Semaforo>
                </div>
                <Medidor pct={i.atingimentoPct} tom={i.semaforo} />
              </div>
            ))}
          </div>
        </Secao>
      </div>

      <Secao titulo="Resumo executivo" subtitulo={`Período ${v.filtros.de.split("-").reverse().join("/")} a ${v.filtros.ate.split("-").reverse().join("/")}${v.filtros.setor ? ` · ${v.filtros.setor}` : ""}${v.filtros.equipe ? ` · ${v.filtros.equipe}` : ""}.`}>
        <div className="ger-exec">
          <div className="ger-exec__bloco">
            <h4>Números do período</h4>
            <ul>
              <li>{fmtNum(v.kpis.entradas)} entradas (<Variacao pct={variacaoPct(v.kpis.entradas, v.kpisAnterior.entradas)} maiorMelhor={false} sufixo="" />)</li>
              <li>{fmtNum(v.kpis.resolvidos)} resolvidos, {fmtPct(v.kpis.taxaResolucaoPct)} das entradas</li>
              <li>Backlog de {fmtNum(v.kpis.backlog)}, {fmtNum(v.kpis.vencidos)} com SLA vencido</li>
              <li>SLA de solução em {fmtPct(v.kpis.slaSolucaoPct)} (meta {v.metas.sla_solucao_pct}%)</li>
              <li>TMR de {fmtHoras(v.kpis.tmrHoras)} (meta {v.metas.tmr_horas} h)</li>
            </ul>
          </div>
          <div className="ger-exec__bloco">
            <h4>Principais desvios</h4>
            <ul>
              {criticos.length === 0 && atencao.length === 0 && <li>Nenhum limite ultrapassado.</li>}
              {[...criticos, ...atencao].slice(0, 5).map((a) => (
                <li key={a.id}>{a.titulo}: {a.texto}</li>
              ))}
            </ul>
          </div>
          <div className="ger-exec__bloco">
            <h4>Decisões necessárias</h4>
            <ul>
              {decisoes.length === 0 && <li>Sem riscos ou oportunidades relevantes neste recorte.</li>}
              {decisoes.map((d) => (
                <li key={d.titulo}><b>{d.titulo}.</b> {d.texto}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="ger-nota">Gerado em {new Date(v.payload.generated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} com os tickets que você pode ver. Para enviar, use "Relatório executivo (PDF)" acima.</p>
      </Secao>
    </>
  );
}
