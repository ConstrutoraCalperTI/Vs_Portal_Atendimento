import { aging, DIAS_SEMANA, mapaCalor } from "../calculos";
import type { Produtividade } from "../calculos";
import { KpiGer, Secao, Semaforo, Tabela, type Coluna } from "../componentes";
import { CORES, fmtHoras, fmtNum, fmtPct, GraficoBarras, GraficoMapaCalor } from "../graficos";
import { useVisao } from "../hooks";
import { semaforo } from "../calculos";
import type { Grupo } from "../types";

const HORAS = Array.from({ length: 13 }, (_, i) => 7 + i); // 7h às 19h

/** Gestão: acompanhar a operação (filas, equipes, produtividade, pendências e ritmo da semana). */
export function Gestao() {
  const v = useVisao();
  const k = v.kpis;
  const calor = mapaCalor(v.entradas);
  const idade = aging(v.backlog, v.agora);
  const pendentes = v.backlog.filter((t) => t.categoriaStatus === "pendente");
  const porStatus = [...new Set(v.backlog.map((t) => t.status))].map((s) => ({ rotulo: s, valor: v.backlog.filter((t) => t.status === s).length })).sort((a, b) => b.valor - a.valor);

  const colunasEquipe: Coluna<Grupo>[] = [
    { chave: "chave", label: "Equipe", valor: (g) => g.chave },
    { chave: "entradas", label: "Entradas", num: true, valor: (g) => g.entradas },
    { chave: "resolvidos", label: "Resolvidos", num: true, valor: (g) => g.resolvidos },
    { chave: "backlog", label: "Backlog", num: true, valor: (g) => g.backlog },
    { chave: "vencidos", label: "Vencidos", num: true, valor: (g) => g.vencidos },
    { chave: "semResponsavel", label: "Sem resp.", num: true, valor: (g) => g.semResponsavel },
    { chave: "sla", label: "SLA solução", num: true, valor: (g) => g.slaSolucaoPct, render: (g) => <Semaforo tom={semaforo(g.slaSolucaoPct, v.metas.sla_solucao_pct, true)}>{fmtPct(g.slaSolucaoPct)}</Semaforo> },
    { chave: "tmr", label: "TMR", num: true, valor: (g) => g.tmrHoras, render: (g) => fmtHoras(g.tmrHoras) },
  ];
  const colunasAgente: Coluna<Produtividade>[] = [
    { chave: "responsavel", label: "Agente", valor: (p) => p.responsavel },
    { chave: "resolvidos", label: "Resolvidos", num: true, valor: (p) => p.resolvidos },
    { chave: "backlog", label: "Carga atual", num: true, valor: (p) => p.backlog },
    { chave: "vencidos", label: "Vencidos", num: true, valor: (p) => p.vencidos },
    { chave: "sla", label: "SLA solução", num: true, valor: (p) => p.slaSolucaoPct, render: (p) => <Semaforo tom={semaforo(p.slaSolucaoPct, v.metas.sla_solucao_pct, true)}>{fmtPct(p.slaSolucaoPct)}</Semaforo> },
    { chave: "tmr", label: "TMR", num: true, valor: (p) => p.tmrHoras, render: (p) => fmtHoras(p.tmrHoras) },
    { chave: "esforco", label: "Interações/ticket", num: true, valor: (p) => p.esforcoMedio, render: (p) => fmtNum(p.esforcoMedio, 1) },
  ];

  return (
    <>
      <div className="ds-kpis">
        <KpiGer label="Backlog" valor={fmtNum(k.backlog)} unidade="abertos" hint={`${fmtNum(k.vencidos)} vencidos`} />
        <KpiGer label="Sem responsável" valor={fmtNum(k.semResponsavel)} hint="Aguardando atribuição" tom={semaforo(k.semResponsavel, v.metas.sem_responsavel_max, false)} />
        <KpiGer label="Pendentes" valor={fmtNum(pendentes.length)} hint="Aguardando solicitante ou terceiros" />
        <KpiGer label="Parados" valor={fmtNum(k.parados)} hint={`Sem ação há +${v.metas.parado_dias} dias`} tom={k.parados > 0 ? "vermelho" : "verde"} />
        <KpiGer label="Resolvidos no período" valor={fmtNum(k.resolvidos)} hint={`${fmtPct(k.taxaResolucaoPct)} das entradas`} />
        <KpiGer label="Esforço médio" valor={fmtNum(k.esforcoMedio, 1)} unidade="interações" hint="Por ticket resolvido" />
      </div>

      <Secao titulo="Equipes" subtitulo="Volume, fila e desempenho de cada equipe no período.">
        <Tabela colunas={colunasEquipe} linhas={v.grupos.equipe} chave={(g) => g.chave} ordemInicial={{ chave: "backlog", desc: true }} totais={{ entradas: k.entradas, resolvidos: k.resolvidos, backlog: k.backlog, vencidos: k.vencidos, semResponsavel: k.semResponsavel, sla: fmtPct(k.slaSolucaoPct), tmr: fmtHoras(k.tmrHoras) }} />
      </Secao>

      <div className="ger-grid ger-grid--21">
        <Secao titulo="Produtividade por agente" subtitulo="Resolvidos no período e a carga que cada um tem agora.">
          <Tabela colunas={colunasAgente} linhas={v.produtividade} chave={(p) => p.responsavel} ordemInicial={{ chave: "resolvidos", desc: true }} />
        </Secao>
        <Secao titulo="Ranking de resolução" subtitulo="Quem mais resolveu no período.">
          <GraficoBarras titulo="Resolvidos por agente" itens={v.produtividade.slice(0, 10).map((p, i) => ({ rotulo: p.responsavel, valor: p.resolvidos, detalhe: fmtPct(p.slaSolucaoPct), cor: i === 0 ? CORES[1] : CORES[0] }))} />
        </Secao>
      </div>

      <div className="ger-grid ger-grid--3">
        <Secao titulo="Idade do backlog" subtitulo="Há quanto tempo os abertos estão esperando.">
          <GraficoBarras titulo="Backlog por idade" itens={idade.map((f) => ({ rotulo: f.faixa, valor: f.total, detalhe: f.vencidos ? `${f.vencidos} vencidos` : undefined, cor: f.vencidos > 0 ? CORES[4] : CORES[0] }))} />
        </Secao>
        <Secao titulo="Pendências por status" subtitulo="Em que situação os abertos estão.">
          <GraficoBarras titulo="Backlog por status" itens={porStatus.map((s) => ({ rotulo: s.rotulo, valor: s.valor }))} />
        </Secao>
        <Secao titulo="Serviços com mais fila" subtitulo="Backlog por serviço.">
          <GraficoBarras titulo="Backlog por serviço" itens={v.grupos.servico.filter((g) => g.backlog > 0).sort((a, b) => b.backlog - a.backlog).slice(0, 8).map((g) => ({ rotulo: g.chave, valor: g.backlog, detalhe: g.vencidos ? `${g.vencidos} vencidos` : undefined }))} />
        </Secao>
      </div>

      <Secao titulo="Quando os chamados chegam" subtitulo="Entradas por dia da semana e hora (7h às 19h), no período.">
        <GraficoMapaCalor titulo="Entradas por dia da semana e hora" matriz={calor.map((l) => HORAS.map((h) => l[h]))} linhas={DIAS_SEMANA} colunas={HORAS.map((h) => `${h}h`)} />
      </Secao>
    </>
  );
}
