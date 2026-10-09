import { Construction } from "lucide-react";
import { EmptyState } from "../../configuracoes/components/EmptyState";
import { Secao } from "../componentes";

// Provisório (09/10/2026): o Gerencial.tsx já importava esta tela, mas o arquivo não foi enviado ao repositório e o
// build (tsc -b) quebrava. Fica como "em construção" até a frente do menu gerencial entregar a versão real.

/** Indicadores: KPIs com semáforo, meta, variação e atingimento (em construção). */
export function Indicadores() {
  return (
    <Secao titulo="Indicadores" subtitulo="KPIs com semáforo, meta, variação e atingimento.">
      <EmptyState icon={Construction} title="Página em construção" description="Os indicadores com semáforo e metas chegam em breve. Enquanto isso, veja a Visão Geral e a Gestão." />
    </Secao>
  );
}
