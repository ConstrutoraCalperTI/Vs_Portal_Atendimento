import { Construction } from "lucide-react";
import { EmptyState } from "../../configuracoes/components/EmptyState";
import { Secao } from "../componentes";

// Provisório (09/10/2026): o Gerencial.tsx já importava esta tela, mas o arquivo não foi enviado ao repositório e o
// build (tsc -b) quebrava. Fica como "em construção" até a frente do menu gerencial entregar a versão real.

/** Alertas: limites ultrapassados e avisos no sino (em construção). */
export function Alertas() {
  return (
    <Secao titulo="Alertas" subtitulo="Limites ultrapassados e avisos no sino.">
      <EmptyState icon={Construction} title="Página em construção" description="Os alertas de limites ultrapassados chegam em breve. Enquanto isso, veja a Visão Geral e a Gestão." />
    </Secao>
  );
}
