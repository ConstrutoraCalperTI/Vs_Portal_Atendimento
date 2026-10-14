import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Breadcrumb } from "../components/Breadcrumb";
import { PageSkeleton } from "../components/PageSkeleton";
import { getMenuItem } from "../config/menuRegistry";
import { useAccess } from "../features/configuracoes/access/useAccess";
import { PageHeader } from "../features/configuracoes/components/PageHeader";
import { NotFound } from "./NotFound";

const TicketsMovidesk = lazy(() => import("../features/movidesk/TicketsMovidesk").then((m) => ({ default: m.TicketsMovidesk })));

// Gestão Tickets Movidesk: item `gestao_movidesk` do menuRegistry, com a seção Tickets (só Admin e Super admin, D1).
const page = getMenuItem("gestao_movidesk");
const tickets = getMenuItem("gestao_movidesk_tickets");

export function GestaoTicketsMovidesk() {
  const { hasPermission } = useAccess();
  const pode = hasPermission("gestao_movidesk_tickets");

  return (
    <>
      <Breadcrumb items={[{ label: "Início", to: "/home" }, { label: page.label, to: tickets.path }, { label: tickets.label }]} />
      <PageHeader title={page.label} description={page.description} />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route index element={pode ? <Navigate to={tickets.path} replace /> : <NotFound />} />
          <Route path="tickets" element={pode ? <TicketsMovidesk /> : <NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
