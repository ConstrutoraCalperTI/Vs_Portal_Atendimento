import { DIAS_SEMANA, histogramaSolucao, mapaCalor, pareto } from "../calculos";
import { Secao } from "../componentes";
import { CORES, fmtDia, fmtNum, GraficoBarras, GraficoColunas, GraficoDonut, GraficoLinha, GraficoMapaCalor, GraficoPareto } from "../graficos";
import { useVisao } from "../hooks";

const HORAS = Array.from({ length: 13 }, (_, i) => 7 + i);

/** Análises: facilitar a interpretação (Pareto, participação, mapa de calor, tempos, linha do tempo e ponte do backlog). */
export function Analises() {
  const v = useVisao();
  const par = pareto(v.grupos.servico);
  const hist = histogramaSolucao(v.resolvidos);
  const calor = mapaCalor(v.entradas);
  const k = v.kpis;
  const inicio = v.diaria.length ? v.diaria[0].backlog - v.diaria[0].entradas + v.diaria[0].resolvidos : 0;
  // Ponte do backlog (waterfall em barras): início → +entradas → −resolvidos → −cancelados → fim.
  const ponte = [
    { rotulo: "Backlog no início", valor: Math.max(0, inicio), cor: CORES[0] },
    { rotulo: "+ Entradas", valor: k.entradas, cor: CORES[2] },
    { rotulo: "− Resolvidos", valor: k.resolvidos, cor: CORES[1] },
    { rotulo: "− Cancelados", valor: k.cancelados, cor: CORES[3] },
    { rotulo: "Backlog no fim", valor: k.backlog, cor: CORES[0] },
  ];
  const semana = DIAS_SEMANA.map((d, i) => ({ rotulo: d, valor: calor[i].reduce((s, x) => s + x, 0) }));

  return (
    <>
      <div className="ger-grid ger-grid--2">
        <Secao titulo="Pareto de serviços" subtitulo="Poucos serviços concentram a maior parte da demanda: os que somam 80% vêm destacados.">
          <GraficoPareto titulo="Pareto de entradas por serviço" itens={par} />
        </Secao>
        <Secao titulo="Linha do tempo do período" subtitulo="Entradas por dia, com o backlog no fim de cada dia.">
          <GraficoColunas titulo="Entradas por dia" rotulos={v.diaria.map((p) => fmtDia(p.dia))} series={[{ nome: "Entradas", valores: v.diaria.map((p) => p.entradas) }]} />
          <GraficoLinha titulo="Backlog no fim do dia" rotulos={v.diaria.map((p) => fmtDia(p.dia))} series={[{ nome: "Backlog", valores: v.diaria.map((p) => p.backlog) }]} altura={140} formato={(x) => fmtNum(x)} />
        </Secao>
      </div>

      <div className="ger-grid ger-grid--3">
        <Secao titulo="Participação por canal" subtitulo="Entradas no período.">
          <GraficoDonut titulo="Entradas por canal" itens={v.grupos.origem.map((g) => ({ rotulo: g.chave, valor: g.entradas }))} centro="entradas" />
        </Secao>
        <Secao titulo="Participação por categoria" subtitulo="Problema, solicitação, dúvida…">
          <GraficoDonut titulo="Entradas por categoria" itens={v.grupos.categoria.map((g) => ({ rotulo: g.chave, valor: g.entradas }))} centro="entradas" />
        </Secao>
        <Secao titulo="Participação por urgência" subtitulo="Como a demanda se distribui em prioridade.">
          <GraficoDonut titulo="Entradas por urgência" itens={v.grupos.urgencia.map((g) => ({ rotulo: g.chave, valor: g.entradas }))} centro="entradas" />
        </Secao>
      </div>

      <div className="ger-grid ger-grid--2">
        <Secao titulo="Tempo até resolver" subtitulo="Quantos resolvidos caem em cada faixa de tempo (horas corridas).">
          <GraficoColunas titulo="Distribuição do tempo de resolução" rotulos={hist.map((h) => h.faixa)} series={[{ nome: "Resolvidos", valores: hist.map((h) => h.total) }]} rotulosDiretos />
        </Secao>
        <Secao titulo="Ponte do backlog" subtitulo="De onde o backlog do fim do período veio.">
          <GraficoBarras titulo="Ponte do backlog" itens={ponte} />
        </Secao>
      </div>

      <div className="ger-grid ger-grid--21">
        <Secao titulo="Mapa de calor: dia × hora" subtitulo="Entradas por dia da semana e hora (7h às 19h).">
          <GraficoMapaCalor titulo="Entradas por dia da semana e hora" matriz={calor.map((l) => HORAS.map((h) => l[h]))} linhas={DIAS_SEMANA} colunas={HORAS.map((h) => `${h}h`)} />
        </Secao>
        <Secao titulo="Entradas por dia da semana" subtitulo="Soma do período.">
          <GraficoBarras titulo="Entradas por dia da semana" itens={semana} />
        </Secao>
      </div>

      <Secao titulo="Departamentos que mais demandam" subtitulo="Entradas por departamento do solicitante (quando identificado).">
        <GraficoBarras titulo="Entradas por departamento" itens={v.grupos.departamento.slice(0, 10).map((g) => ({ rotulo: g.chave, valor: g.entradas, detalhe: `${g.backlog} abertos` }))} />
      </Secao>
    </>
  );
}
