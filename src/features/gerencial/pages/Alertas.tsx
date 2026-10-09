import { AlertTriangle, Bell, CheckCircle2, Info, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ADMIN_ROLE } from "../../../config/app";
import { getMenuItem } from "../../../config/menuRegistry";
import { useAccess } from "../../configuracoes/access/useAccess";
import { ServiceError } from "../../configuracoes/services/types";
import { KpiGer, Secao, Semaforo } from "../componentes";
import { fmtNum } from "../graficos";
import { useEnviarAlertas, useVisao } from "../hooks";
import type { Alerta } from "../types";

const NIVEIS: Record<Alerta["nivel"], { label: string; descricao: string; tom: "vermelho" | "amarelo" | "verde"; icone: typeof Bell }> = {
  critico: { label: "Críticos", descricao: "Limite ultrapassado em mais de 10%. Precisa de ação agora.", tom: "vermelho", icone: AlertTriangle },
  atencao: { label: "Atenção", descricao: "Perto do limite (até 10% fora). Vale acompanhar.", tom: "amarelo", icone: Info },
  ok: { label: "Dentro do limite", descricao: "Regras verificadas e em dia neste recorte.", tom: "verde", icone: CheckCircle2 },
};

const sufixo = (unidade: string) => (unidade === "%" ? "%" : unidade === "h" ? " h" : ` ${unidade}`);
const fmtComUnidade = (valor: number, unidade: string) => `${fmtNum(valor, unidade === "h" ? 1 : 0)}${sufixo(unidade)}`;

/** Alertas: limites ultrapassados no recorte atual e os avisos automáticos no sino (dias úteis, 8h). */
export function Alertas() {
  const v = useVisao();
  const { role, isSuperAdmin } = useAccess();
  const podeDisparar = isSuperAdmin || role === ADMIN_ROLE;
  const enviar = useEnviarAlertas();
  const [erro, setErro] = useState<string | null>(null);
  const base = getMenuItem("gestao_chamados_gerencial").path;
  const porNivel = (n: Alerta["nivel"]) => v.alertas.filter((a) => a.nivel === n);
  const criticos = porNivel("critico");
  const atencao = porNivel("atencao");
  const tomDe = (id: string) => (criticos.some((a) => a.id === id) ? "vermelho" : atencao.some((a) => a.id === id) ? "amarelo" : "verde");

  return (
    <>
      <div className="ds-kpis">
        <KpiGer label="Alertas críticos" valor={fmtNum(criticos.length)} tom={criticos.length ? "vermelho" : "verde"} hint={criticos.length ? "Limite ultrapassado em mais de 10%" : "Nenhum limite ultrapassado"} />
        <KpiGer label="Em atenção" valor={fmtNum(atencao.length)} tom={atencao.length ? "amarelo" : "verde"} hint="Perto do limite" />
        <KpiGer label="Regras verificadas" valor={fmtNum(v.alertas.length)} hint={`${porNivel("ok").length} dentro do limite`} />
        <KpiGer label="SLA vencido" valor={fmtNum(v.kpis.vencidos)} unidade="abertos" tom={tomDe("vencidos")} hint={`Limite: ${v.metas.vencidos_max}`} />
        <KpiGer label="Sem responsável" valor={fmtNum(v.kpis.semResponsavel)} unidade="abertos" tom={tomDe("sem_responsavel")} hint={`Limite: ${v.metas.sem_responsavel_max}`} />
        <KpiGer label="Parados" valor={fmtNum(v.kpis.parados)} unidade="abertos" tom={v.kpis.parados ? "vermelho" : "verde"} hint={`Mais de ${v.metas.parado_dias} dias sem ação`} />
      </div>

      {(Object.keys(NIVEIS) as Alerta["nivel"][]).map((nivel) => {
        const lista = porNivel(nivel);
        const N = NIVEIS[nivel];
        return (
          <Secao key={nivel} titulo={N.label} subtitulo={N.descricao} aside={<Semaforo tom={N.tom}>{lista.length}</Semaforo>}>
            <div className="ger-lista">
              {lista.length === 0 && <p className="gr-vazio">{nivel === "ok" ? "Nenhuma regra dentro do limite neste recorte." : "Nenhum alerta deste nível neste recorte."}</p>}
              {lista.map((a) => (
                <div key={a.id} className={`ger-item ger-item--${a.nivel}`}>
                  <span className="ger-item__icone">
                    <N.icone size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <b>{a.titulo}</b>
                    <p>{a.texto}</p>
                  </div>
                  <span className="ger-item__lado">
                    {fmtComUnidade(a.valor, a.unidade)}
                    <br />
                    limite {fmtComUnidade(a.limite, a.unidade)}
                  </span>
                </div>
              ))}
            </div>
          </Secao>
        );
      })}

      <div className="ger-grid ger-grid--2">
        <Secao titulo="Avisos no sino" subtitulo="O que chega como notificação, sem ninguém precisar abrir esta tela.">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
            <li>
              <b>Quando:</b> dias úteis às 8h (horário de São Paulo), de forma automática.
            </li>
            <li>
              <b>Para quem:</b> Admin, Super admin e quem tem acesso à visão gerencial, cada um só com os tickets que pode ver.
            </li>
            <li>
              <b>Regras:</b> SLA vencido acima do limite, tickets sem responsável, backlog acima do limite e tickets parados.
            </li>
            <li>
              <b>Sem repetição:</b> um aviso por regra, por pessoa e por dia; se já foi enviado hoje, não vai de novo.
            </li>
            <li>
              <b>Limites:</b> os mesmos de <Link to={{ pathname: `${base}/indicadores`, search: location.search }}>Indicadores › Metas e limites</Link>.
            </li>
          </ul>
          <p className="ger-nota">Os avisos olham a situação de agora, do backlog inteiro; os alertas acima usam o período e os filtros escolhidos.</p>
        </Secao>
        <Secao titulo="Enviar alertas agora" subtitulo={podeDisparar ? "Dispara a mesma rotina das 8h sem esperar o horário. Só Admin e Super admin." : "Só Admin e Super admin disparam os avisos fora do horário."}>
          <div className="ger-acoes">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!podeDisparar || enviar.isPending}
              onClick={() => {
                setErro(null);
                enviar.mutate(undefined, { onError: (err) => setErro(err instanceof ServiceError ? err.message : "Não foi possível enviar os alertas. Tente de novo.") });
              }}
            >
              <Send size={16} aria-hidden="true" /> {enviar.isPending ? "Enviando…" : "Enviar alertas agora"}
            </button>
            {enviar.isSuccess && (
              <span className="ds-muted" style={{ fontSize: 13 }}>
                {enviar.data === 0 ? "Nada novo para avisar: ou está tudo dentro dos limites, ou os avisos de hoje já foram enviados." : `${enviar.data} ${enviar.data === 1 ? "aviso criado" : "avisos criados"} no sino.`}
              </span>
            )}
          </div>
          {erro && (
            <p className="ger-nota" role="alert">
              {erro}
            </p>
          )}
        </Secao>
      </div>
    </>
  );
}
