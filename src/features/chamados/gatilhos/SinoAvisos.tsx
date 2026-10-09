import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { getMenuItem } from "../../../config/menuRegistry";
import { useLerNotificacoes, useNotificacoes } from "./avisos";
import "./SinoAvisos.css";

const QUANDO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Sino do topo: avisos dos gatilhos (G4). Clicar abre o ticket e marca como lido. */
export function SinoAvisos({ ativo }: { ativo: boolean }) {
  const q = useNotificacoes(ativo);
  const ler = useLerNotificacoes();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const naoLidas = q.data?.naoLidas ?? 0;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div className="sino" ref={caixa}>
      <button
        type="button"
        className="topbar__icon-button"
        aria-label={naoLidas ? `Notificações: ${naoLidas} não lidas` : "Notificações"}
        aria-haspopup="true"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
      >
        <Bell size={18} />
        {naoLidas > 0 && <span className="sino__n">{naoLidas > 9 ? "9+" : naoLidas}</span>}
      </button>
      {aberto && (
        <div className="sino__painel" role="dialog" aria-label="Notificações">
          <div className="sino__h">
            <b>Notificações</b>
            {naoLidas > 0 && (
              <button type="button" className="sino__link" disabled={ler.isPending} onClick={() => ler.mutate(null)}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          {!q.data?.itens.length ? (
            <p className="sino__vazio">Nenhum aviso por enquanto. Os gatilhos avisam aqui quando algo precisa da sua atenção.</p>
          ) : (
            <ul>
              {q.data.itens.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`sino__item${n.lida ? "" : " sino__item--nova"}`}
                    onClick={() => {
                      if (!n.lida) ler.mutate([n.id]);
                      setAberto(false);
                      if (n.ticketId) navigate(`${getMenuItem("gestao_chamados_tickets").path}/${n.ticketId}`);
                    }}
                  >
                    <b>{n.titulo}</b>
                    <span>{n.texto}</span>
                    <small>{QUANDO.format(new Date(n.criadoEm))}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
