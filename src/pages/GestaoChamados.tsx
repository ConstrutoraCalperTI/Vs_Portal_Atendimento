import { Ticket } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { getMenuItem } from "../config/menuRegistry";
import { EmptyState } from "../features/configuracoes/components/EmptyState";
import { PageHeader } from "../features/configuracoes/components/PageHeader";

// Gestão de Chamados: item `gestao_chamados` do menuRegistry. A visão geral (dashboard da fila de
// tickets) entra aqui na etapa 3 do design system.
const page = getMenuItem("gestao_chamados");

export function GestaoChamados() {
  return (
    <>
      <Breadcrumb items={[{ label: "Início", to: "/home" }, { label: page.label }]} />
      <PageHeader title={page.label} description={page.description} />
      <div className="card">
        <EmptyState icon={Ticket} title="Em construção" description="A visão geral dos chamados chega com o novo painel." />
      </div>
    </>
  );
}
