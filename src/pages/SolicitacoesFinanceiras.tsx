import { Wallet } from "lucide-react";
import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { Breadcrumb } from "../components/Breadcrumb";
import { PageSkeleton } from "../components/PageSkeleton";
import { getMenuItem, type MenuItemId } from "../config/menuRegistry";
import { useAccess } from "../features/configuracoes/access/useAccess";
import { EmptyState } from "../features/configuracoes/components/EmptyState";
import { PageHeader } from "../features/configuracoes/components/PageHeader";
import { NotFound } from "./NotFound";
import "../features/configuracoes/pages/Integracoes.css";

const CadastrosFinanceiros = lazy(() => import("../features/financeiro/CadastrosFinanceiros").then((m) => ({ default: m.CadastrosFinanceiros })));

// Solicitações Financeiras: item `solicitacoes_financeiras` do menuRegistry (docs/Solicitacoes-financeiras/CONTEXTO.md).
// Cada tela é uma seção com rota própria abaixo de /financeiro. Fase 1: Cadastros financeiros.
const page = getMenuItem("solicitacoes_financeiras");

const SECOES: { id: MenuItemId; segmento: string }[] = [{ id: "sf_cadastros", segmento: "cadastros" }];

export function SolicitacoesFinanceiras() {
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
                  <EmptyState icon={Wallet} title="Nenhuma tela liberada" description="Peça ao administrador acesso às Solicitações Financeiras." />
                </div>
              )
            }
          />
          <Route path="cadastros" element={pode("sf_cadastros") ? <CadastrosFinanceiros /> : <NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
