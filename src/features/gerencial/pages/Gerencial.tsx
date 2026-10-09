import { Activity, BarChart3, Bell, Download, FileText, Gauge, LayoutDashboard, Lightbulb, PieChart, TrendingUp } from "lucide-react";
import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { getMenuItem } from "../../../config/menuRegistry";
import { ErrorState } from "../../configuracoes/components/ErrorState";
import { dia, diasEntre } from "../calculos";
import { PRESETS, useFiltros, useGerencialDados, VisaoProvider } from "../hooks";
import { ORIGEM_ROTULO, type Filtros, type GerencialPayload, type OrigemTicket } from "../types";
import "../Gerencial.css";

// Gestão de Chamados › Gerencial (seção `gestao_chamados_gerencial`, docs/PLANO-gerencial.md): dez telas sobre
// os mesmos dados e os mesmos filtros (que ficam na URL, então um link reproduz exatamente o que se vê).
// Ordem pedida: Visão Geral → Gestão → Estratégico → Indicadores → Relatórios → Análises → Projeções → Alertas →
// Insights → Exportações.

const VisaoGeral = lazy(() => import("./VisaoGeral").then((m) => ({ default: m.VisaoGeral })));
const Gestao = lazy(() => import("./Gestao").then((m) => ({ default: m.Gestao })));
const Estrategico = lazy(() => import("./Estrategico").then((m) => ({ default: m.Estrategico })));
const Indicadores = lazy(() => import("./Indicadores").then((m) => ({ default: m.Indicadores })));
const Relatorios = lazy(() => import("./Relatorios").then((m) => ({ default: m.Relatorios })));
const Analises = lazy(() => import("./Analises").then((m) => ({ default: m.Analises })));
const Projecoes = lazy(() => import("./Projecoes").then((m) => ({ default: m.Projecoes })));
const Alertas = lazy(() => import("./Alertas").then((m) => ({ default: m.Alertas })));
const Insights = lazy(() => import("./Insights").then((m) => ({ default: m.Insights })));
const Exportacoes = lazy(() => import("./Exportacoes").then((m) => ({ default: m.Exportacoes })));

export const TELAS = [
  { segmento: "visao-geral", label: "Visão Geral", icon: LayoutDashboard, descricao: "O essencial do período num só lugar." },
  { segmento: "gestao", label: "Gestão", icon: Gauge, descricao: "Operação: filas, equipes, produtividade e pendências." },
  { segmento: "estrategico", label: "Estratégico", icon: TrendingUp, descricao: "Tendências de 13 meses, metas e resumo executivo." },
  { segmento: "indicadores", label: "Indicadores", icon: Activity, descricao: "KPIs com semáforo, meta, variação e atingimento." },
  { segmento: "relatorios", label: "Relatórios", icon: FileText, descricao: "Analítico, sintético, consolidado e comparativo." },
  { segmento: "analises", label: "Análises", icon: PieChart, descricao: "Pareto, distribuição, mapa de calor e tempos." },
  { segmento: "projecoes", label: "Projeções", icon: BarChart3, descricao: "Demanda e backlog previstos para 30, 60 e 90 dias." },
  { segmento: "alertas", label: "Alertas", icon: Bell, descricao: "Limites ultrapassados e avisos no sino." },
  { segmento: "insights", label: "Insights", icon: Lightbulb, descricao: "Anomalias, tendências, riscos, oportunidades e IA." },
  { segmento: "exportacoes", label: "Exportações", icon: Download, descricao: "Excel, CSV, PDF, JSON e API." },
] as const;

export function Gerencial() {
  const dados = useGerencialDados();
  if (dados.isPending) return <PageSkeleton />;
  if (dados.isError) return <ErrorState message="Não foi possível carregar a visão gerencial." onRetry={() => void dados.refetch()} />;
  return <GerencialConteudo payload={dados.data} />;
}

function GerencialConteudo({ payload }: { payload: GerencialPayload }) {
  const hoje = dia(payload.generated_at);
  const { filtros, preset, definir, aplicarPreset } = useFiltros(hoje);
  const base = getMenuItem("gestao_chamados_gerencial").path;
  const setores = [...new Set(payload.tickets.map((t) => t.setor).filter((s): s is string => Boolean(s)))].sort();
  const equipes = [...new Set(payload.tickets.filter((t) => !filtros.setor || t.setor === filtros.setor).map((t) => t.equipe ?? "").filter(Boolean))].sort();

  return (
    <div className="ger">
      <nav className="ger-tabs" aria-label="Telas da visão gerencial">
        {TELAS.map((t) => (
          <NavLink key={t.segmento} to={{ pathname: `${base}/${t.segmento}`, search: location.search }} className={({ isActive }) => `ger-tabs__link${isActive ? " ger-tabs__link--active" : ""}`} title={t.descricao}>
            <t.icon size={15} aria-hidden="true" />
            {t.label}
          </NavLink>
        ))}
      </nav>

      <BarraFiltros filtros={filtros} preset={preset} definir={definir} aplicarPreset={aplicarPreset} hoje={hoje} setores={setores} equipes={equipes} total={payload.tickets.length} />

      <VisaoProvider payload={payload} filtros={filtros}>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route index element={<Navigate to={{ pathname: `${base}/visao-geral`, search: location.search }} replace />} />
            <Route path="visao-geral" element={<VisaoGeral />} />
            <Route path="gestao" element={<Gestao />} />
            <Route path="estrategico" element={<Estrategico />} />
            <Route path="indicadores" element={<Indicadores />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="analises" element={<Analises />} />
            <Route path="projecoes" element={<Projecoes />} />
            <Route path="alertas" element={<Alertas />} />
            <Route path="insights" element={<Insights />} />
            <Route path="exportacoes" element={<Exportacoes />} />
            <Route path="*" element={<Navigate to={{ pathname: `${base}/visao-geral`, search: location.search }} replace />} />
          </Routes>
        </Suspense>
      </VisaoProvider>
    </div>
  );
}

interface BarraProps {
  filtros: Filtros;
  preset: string;
  definir: (p: Partial<Filtros>) => void;
  aplicarPreset: (p: (typeof PRESETS)[number]["id"]) => void;
  hoje: string;
  setores: string[];
  equipes: string[];
  total: number;
}

function BarraFiltros({ filtros, preset, definir, aplicarPreset, hoje, setores, equipes, total }: BarraProps) {
  return (
    <div className="ger-filtros" role="group" aria-label="Filtros da visão gerencial">
      <div className="ger-filtros__grupo">
        <span>Período</span>
        <div className="ger-filtros__presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={`ger-filtros__preset${preset === p.id ? " ger-filtros__preset--ativo" : ""}`} onClick={() => aplicarPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <label className="ger-filtros__grupo">
        <span>De</span>
        <input type="date" value={filtros.de} max={filtros.ate} onChange={(e) => e.target.value && definir({ de: e.target.value })} />
      </label>
      <label className="ger-filtros__grupo">
        <span>Até</span>
        <input type="date" value={filtros.ate} min={filtros.de} max={hoje} onChange={(e) => e.target.value && definir({ ate: e.target.value })} />
      </label>
      {setores.length > 1 && (
        <label className="ger-filtros__grupo">
          <span>Setor</span>
          <select value={filtros.setor} onChange={(e) => definir({ setor: e.target.value, equipe: "" })}>
            <option value="">Todos</option>
            {setores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      <label className="ger-filtros__grupo">
        <span>Equipe</span>
        <select value={filtros.equipe} onChange={(e) => definir({ equipe: e.target.value })}>
          <option value="">Todas</option>
          {equipes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="ger-filtros__grupo">
        <span>Canal</span>
        <select value={filtros.origem} onChange={(e) => definir({ origem: e.target.value as OrigemTicket | "" })}>
          <option value="">Todos</option>
          {(Object.keys(ORIGEM_ROTULO) as OrigemTicket[]).map((o) => (
            <option key={o} value={o}>{ORIGEM_ROTULO[o]}</option>
          ))}
        </select>
      </label>
      <span className="ger-filtros__resumo">
        {diasEntre(filtros.de, filtros.ate)} dias · {total.toLocaleString("pt-BR")} tickets carregados (13 meses)
      </span>
    </div>
  );
}
