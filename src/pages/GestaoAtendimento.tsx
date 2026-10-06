import { Headset } from "lucide-react";
import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { Breadcrumb } from "../components/Breadcrumb";
import { PageSkeleton } from "../components/PageSkeleton";
import { getMenuItem, type MenuItemId } from "../config/menuRegistry";
import { useAccess } from "../features/configuracoes/access/useAccess";
import { EmptyState } from "../features/configuracoes/components/EmptyState";
import { PageHeader } from "../features/configuracoes/components/PageHeader";
import { NotFound } from "./NotFound";
// Abas de seção (mesmo visual de Integrações).
import "../features/configuracoes/pages/Integracoes.css";

const Central = lazy(() => import("../features/atendimento/pages/Central").then((m) => ({ default: m.Central })));
const FilaHorarios = lazy(() => import("../features/atendimento/pages/FilaHorarios").then((m) => ({ default: m.FilaHorarios })));
const Setores = lazy(() => import("../features/atendimento/pages/Setores").then((m) => ({ default: m.Setores })));

// Gestão de Atendimento: item `gestao_atendimento` do menuRegistry. Cada tela é uma seção
// (`parent: "gestao_atendimento"`) com rota própria abaixo de /gestao-atendimento. O que cada um vê
// dentro da tela (setores, Monitor) vem do banco: gestor só nos setores dele, supervisão geral em todos.
const page = getMenuItem("gestao_atendimento");

const SECOES: { id: MenuItemId; segmento: string }[] = [
  { id: "gestao_atendimento_central", segmento: "central" },
  { id: "gestao_atendimento_fila", segmento: "fila" },
  { id: "gestao_atendimento_setores", segmento: "setores" },
];

export function GestaoAtendimento() {
  const { hasPermission } = useAccess();
  const liberadas = SECOES.filter((s) => hasPermission(s.id)).map((s) => ({ ...s, item: getMenuItem(s.id) }));
  const pode = (id: MenuItemId) => hasPermission(id);

  return (
    <>
      <Breadcrumb items={[{ label: "Início", to: "/home" }, { label: page.label }]} />
      <PageHeader title={page.label} description={page.description} />

      {liberadas.length > 1 && (
        <nav className="section-nav" aria-label={`Seções de ${page.label}`}>
          {liberadas.map(({ id, item }) => {
            const Icone = item.icon;
            return (
              <NavLink key={id} to={item.path} className={({ isActive }) => `section-nav__link${isActive ? " section-nav__link--active" : ""}`}>
                <Icone size={16} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      )}

      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route
            index
            element={
              liberadas[0] ? (
                <Navigate to={liberadas[0].item.path} replace />
              ) : (
                <div className="card">
                  <EmptyState icon={Headset} title="Nenhuma tela liberada" description="Peça ao administrador acesso às telas de Gestão de Atendimento." />
                </div>
              )
            }
          />
          <Route path="central" element={pode("gestao_atendimento_central") ? <Central /> : <NotFound />} />
          <Route path="fila" element={pode("gestao_atendimento_fila") ? <FilaHorarios /> : <NotFound />} />
          <Route path="setores" element={pode("gestao_atendimento_setores") ? <Setores /> : <NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
