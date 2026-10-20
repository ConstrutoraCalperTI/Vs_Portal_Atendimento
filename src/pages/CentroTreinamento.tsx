import { GraduationCap } from "lucide-react";
import { Route, Routes } from "react-router";
import { Breadcrumb } from "../components/Breadcrumb";
import { ModuleCard } from "../components/ModuleCard";
import { getMenuItem, routeChildrenOf } from "../config/menuRegistry";
import { useAccess } from "../features/configuracoes/access/useAccess";
import { EmptyState } from "../features/configuracoes/components/EmptyState";
import { PageHeader } from "../features/configuracoes/components/PageHeader";
import { NotFound } from "./NotFound";

// Centro de Treinamento: item `centro_treinamento` do menuRegistry. Cada tutorial é uma seção
// (`parent: "centro_treinamento"`) com rota própria abaixo de /centro-treinamento.
const page = getMenuItem("centro_treinamento");

function Tutoriais() {
  const { hasPermission } = useAccess();
  const tutoriais = routeChildrenOf("centro_treinamento").filter((item) => hasPermission(item.id));

  if (tutoriais.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={GraduationCap} title="Nenhum tutorial publicado" description="Os tutoriais de cada funcionalidade do portal aparecem aqui." />
      </div>
    );
  }

  return (
    <section>
      <h2 className="section-title">Tutoriais</h2>
      <div className="module-grid">
        {tutoriais.map((item, index) => (
          <ModuleCard
            key={item.id}
            title={item.label}
            description={item.description ?? ""}
            icon={item.icon}
            accent="brand"
            to={item.path}
            permission={item.id}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}

export function CentroTreinamento() {
  return (
    <>
      <Breadcrumb items={[{ label: "Início", to: "/home" }, { label: page.label }]} />
      <PageHeader title={page.label} description={page.description} />
      <Routes>
        <Route index element={<Tutoriais />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
