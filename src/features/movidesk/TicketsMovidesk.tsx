import * as Dialog from "@radix-ui/react-dialog";
import { Paperclip, RefreshCw, Ticket, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { StatusBadge, type StatusBadgeVariant } from "../configuracoes/components/StatusBadge";
import { EmptyState } from "../configuracoes/components/EmptyState";
import { ErrorState } from "../configuracoes/components/ErrorState";
import { useAccess } from "../configuracoes/access/useAccess";
import { useReturnFocus } from "../configuracoes/components/useReturnFocus";
import { ServiceError } from "../configuracoes/services/types";
import { useAnexosMovidesk, useOpcoesMovidesk, useSincronizarMovidesk, useTicketMovidesk, useTicketsMovidesk } from "./hooks";
import { movideskService, type AnexoTicket, type Etapa, type FiltrosTickets, type StatusBase, type TicketLinha } from "./service";
import "../configuracoes/components/Sheet.css";
import "./movidesk.css";

// Gestão Tickets Movidesk › Tickets: a base espelhada do Movidesk, só leitura (Admin e Super admin).

export const STATUS_BASE: Record<StatusBase, { rotulo: string; variante: StatusBadgeVariant }> = {
  New: { rotulo: "Novo", variante: "info" },
  InAttendance: { rotulo: "Em atendimento", variante: "warning" },
  Stopped: { rotulo: "Aguardando", variante: "neutral" },
  Resolved: { rotulo: "Resolvido", variante: "success" },
  Closed: { rotulo: "Fechado", variante: "neutral" },
  Canceled: { rotulo: "Cancelado", variante: "neutral" },
};

export const ETAPAS: Record<Etapa, string> = { recentes: "Carga: últimos 90 dias", past: "Carga: histórico antigo", incremental: "Incremental ativo" };

const msgErro = (e: unknown, padrao: string) => (e instanceof ServiceError ? e.message : padrao);

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const tamanho = (b: number | null) => (b === null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/** Rótulo do SLA de solução, como no mockup. */
export function slaDe(t: Pick<TicketLinha, "slaPausado" | "slaSolucaoEm" | "resolvidoEm" | "fechadoEm">, agora = Date.now()): { rotulo: string; tom: "ok" | "bad" | "info" | "off" } {
  if (t.slaPausado) return { rotulo: "SLA: pausado", tom: "off" };
  if (!t.slaSolucaoEm) return { rotulo: "Sem SLA", tom: "off" };
  const prazo = Date.parse(t.slaSolucaoEm);
  const fim = t.resolvidoEm ?? t.fechadoEm;
  if (!fim) return Date.parse(new Date(agora).toISOString()) <= prazo ? { rotulo: "SLA: no prazo", tom: "info" } : { rotulo: "SLA: vencido", tom: "bad" };
  return Date.parse(fim) <= prazo ? { rotulo: "SLA: cumprido", tom: "ok" } : { rotulo: "SLA: estourado", tom: "bad" };
}

/** Texto digitado só vai para a busca depois de uma pausa. */
function useAtrasado<T>(valor: T, ms = 400): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

const VAZIO: FiltrosTickets = { num: "", de: "", ate: "", ano: "", servico: "", responsavel: "", statusBase: "", equipe: "", texto: "" };

export function TicketsMovidesk() {
  const ids = useId();
  const { isSuperAdmin } = useAccess();
  const opcoes = useOpcoesMovidesk();
  const sincronizar = useSincronizarMovidesk();
  const [f, setF] = useState<FiltrosTickets>(VAZIO);
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<number | null>(null);
  const num = useAtrasado(f.num);
  const texto = useAtrasado(f.texto);
  const lista = useTicketsMovidesk({ ...f, num, texto, pagina });

  const muda = (campo: keyof FiltrosTickets) => (e: { target: { value: string } }) => {
    setF((atual) => ({ ...atual, [campo]: campo === "ano" && e.target.value ? Number(e.target.value) : e.target.value }));
    setPagina(1);
  };
  const situacao = opcoes.data?.situacao;
  const dados = lista.data;
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;
  const de = dados && dados.total ? (dados.pagina - 1) * dados.porPagina + 1 : 0;
  const ate = dados ? Math.min(dados.pagina * dados.porPagina, dados.total) : 0;

  return (
    <>
      <div className="md-hero">
        <div>
          <small>Portal de Atendimento · Calper</small>
          <h2>Base de Tickets Movidesk</h2>
        </div>
        <span className="md-spacer" />
        {situacao && (
          <StatusBadge variant={!situacao.temToken ? "warning" : situacao.etapa === "incremental" ? "success" : "info"}>
            {!situacao.temToken ? "Sem token" : ETAPAS[situacao.etapa]}
          </StatusBadge>
        )}
        <span className="md-hero__meta">Última sincronização: {situacao?.ultimaRodadaEm ? dataHora(situacao.ultimaRodadaEm) : "—"}</span>
        {isSuperAdmin && (
          <button
            type="button"
            className="btn btn--outline"
            disabled={sincronizar.isPending}
            onClick={() =>
              sincronizar.mutate(undefined, {
                onSuccess: () => toast.success("Sincronização iniciada. Uma página leva cerca de 1 minuto."),
                onError: (e) => toast.error(msgErro(e, "Não foi possível sincronizar.")),
              })
            }
          >
            <RefreshCw size={15} aria-hidden="true" />
            {sincronizar.isPending ? "Iniciando…" : "Sincronizar agora"}
          </button>
        )}
      </div>

      <section className="card md-card" aria-labelledby={`${ids}-f`}>
        <div className="md-head">
          <h2 id={`${ids}-f`}>Filtros</h2>
          <span className="md-spacer" />
          <button type="button" className="btn btn--outline" onClick={() => { setF(VAZIO); setPagina(1); }}>
            Limpar filtros
          </button>
        </div>
        <div className="md-filtros">
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-num`}>Nº do ticket ou protocolo</label>
            <input id={`${ids}-num`} className="input" inputMode="numeric" placeholder="Ex.: 188081" value={f.num} onChange={muda("num")} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-de`}>Abertura — de</label>
            <input id={`${ids}-de`} className="input" type="date" value={f.de} onChange={muda("de")} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-ate`}>Abertura — até</label>
            <input id={`${ids}-ate`} className="input" type="date" value={f.ate} onChange={muda("ate")} />
          </div>
          <Opcoes id={`${ids}-ano`} rotulo="Ano" valor={String(f.ano ?? "")} onChange={muda("ano")} itens={(opcoes.data?.anos ?? []).map((a) => [String(a), String(a)])} />
          <Opcoes id={`${ids}-sv`} rotulo="Tipo de serviço" valor={f.servico ?? ""} onChange={muda("servico")} itens={(opcoes.data?.servicos ?? []).map((s) => [s, s])} />
          <Opcoes id={`${ids}-ag`} rotulo="Agente responsável" valor={f.responsavel ?? ""} onChange={muda("responsavel")} itens={(opcoes.data?.responsaveis ?? []).map((s) => [s, s])} />
          <Opcoes
            id={`${ids}-st`}
            rotulo="Status base"
            valor={f.statusBase ?? ""}
            onChange={muda("statusBase")}
            itens={(opcoes.data?.statusBase ?? []).map((s) => [s, STATUS_BASE[s]?.rotulo ?? s])}
          />
          <Opcoes id={`${ids}-eq`} rotulo="Equipe" vazio="Todas" valor={f.equipe ?? ""} onChange={muda("equipe")} itens={(opcoes.data?.equipes ?? []).map((s) => [s, s])} />
          <div className="field md-filtros__texto">
            <label className="field__label" htmlFor={`${ids}-txt`}>Palavra-chave (assunto e ações)</label>
            <input id={`${ids}-txt`} className="input" type="search" placeholder="Ex.: boleto, repasse, escritura" value={f.texto} onChange={muda("texto")} />
          </div>
        </div>
      </section>

      <section className="card md-card" aria-labelledby={`${ids}-l`} aria-busy={lista.isFetching}>
        <div className="md-head">
          <h2 id={`${ids}-l`}>{dados ? `${dados.total.toLocaleString("pt-BR")} ticket${dados.total === 1 ? "" : "s"} encontrado${dados.total === 1 ? "" : "s"}` : "Tickets"}</h2>
          <span className="md-spacer" />
          <small>Ordenado por abertura (mais recentes) · 100 por página</small>
        </div>
        {lista.isError ? (
          <ErrorState bare message={msgErro(lista.error, "Não foi possível carregar os tickets.")} onRetry={() => void lista.refetch()} />
        ) : !dados ? (
          <p className="md-vazio">Carregando…</p>
        ) : dados.total === 0 ? (
          <EmptyState
            icon={Ticket}
            title={situacao && situacao.ultimaRodadaEm === null ? "A base ainda não foi sincronizada" : "Nenhum ticket com esses filtros"}
            description={situacao && situacao.ultimaRodadaEm === null ? "A carga começa na janela da agenda em Integrações › Movidesk." : "Limpe ou mude os filtros."}
          />
        ) : (
          <div className="md-tabela-wrap">
            <table className="md-tabela">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Assunto</th>
                  <th scope="col">Serviço</th>
                  <th scope="col">Agente / equipe</th>
                  <th scope="col">Abertura</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.tickets.map((t) => {
                  const sla = slaDe(t);
                  const st = t.statusBase ? STATUS_BASE[t.statusBase] : null;
                  return (
                    <tr
                      key={t.id}
                      tabIndex={0}
                      aria-label={`Ticket ${t.id}: ${t.assunto ?? "sem assunto"}`}
                      onClick={() => setAberto(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setAberto(t.id);
                        }
                      }}
                    >
                      <td>
                        <span className="md-num">#{t.id}</span>
                        <span className="md-sub">{t.protocolo || "sem protocolo"}</span>
                      </td>
                      <td>
                        <span className="md-assunto">{t.assunto || "(sem assunto)"}</span>
                        <span className="md-sub">
                          {t.origem} · {t.tipo === 1 ? "Interno" : "Público"} · {t.qtdAcoes ?? 0} ações
                        </span>
                      </td>
                      <td>{t.servico || "—"}</td>
                      <td>
                        {t.responsavel || "Sem responsável"}
                        <span className="md-sub">{t.equipe || "—"}</span>
                      </td>
                      <td>{dataHora(t.criadoEm)}</td>
                      <td>
                        <StatusBadge variant={st?.variante ?? "neutral"}>{t.status || st?.rotulo || "—"}</StatusBadge>
                        <span className={`md-sla md-sla--${sla.tom}`}>{sla.rotulo}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="md-pag">
          <span>{dados && dados.total ? `Exibindo ${de.toLocaleString("pt-BR")}–${ate.toLocaleString("pt-BR")} de ${dados.total.toLocaleString("pt-BR")} · página ${dados.pagina} de ${paginas}` : ""}</span>
          <span className="md-spacer" />
          <button type="button" className="btn btn--outline" disabled={pagina <= 1 || lista.isFetching} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <button type="button" className="btn btn--outline" disabled={pagina >= paginas || lista.isFetching} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </button>
        </div>
      </section>

      <Detalhe id={aberto} onClose={() => setAberto(null)} />
    </>
  );
}

function Opcoes({ id, rotulo, valor, onChange, itens, vazio = "Todos" }: { id: string; rotulo: string; valor: string; onChange: (e: { target: { value: string } }) => void; itens: [string, string][]; vazio?: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{rotulo}</label>
      <select id={id} className="input" value={valor} onChange={onChange}>
        <option value="">{vazio}</option>
        {itens.map(([v, r]) => (
          <option key={v} value={v}>{r}</option>
        ))}
      </select>
    </div>
  );
}

function Detalhe({ id, onClose }: { id: number | null; onClose: () => void }) {
  const returnFocus = useReturnFocus();
  const t = useTicketMovidesk(id);
  const anexos = useAnexosMovidesk(id);
  const porAcao = new Map<number, AnexoTicket[]>();
  for (const a of anexos.data ?? []) porAcao.set(a.acaoId, [...(porAcao.get(a.acaoId) ?? []), a]);
  const d = t.data;
  const sla = d ? slaDe(d) : null;

  return (
    <Dialog.Root open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="sheet" {...returnFocus}>
          <div className="sheet__form">
            <header className="sheet__header">
              <div>
                <Dialog.Title className="sheet__title">{d ? `#${d.id} · ${d.assunto ?? "(sem assunto)"}` : `#${id ?? ""}`}</Dialog.Title>
                <Dialog.Description className="sheet__description">{d?.servico ?? "Ticket do Movidesk (só leitura)"}</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="icon-btn" aria-label="Fechar">
                  <X size={18} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>
            <div className="sheet__body">
              {t.isError ? (
                <ErrorState bare message={msgErro(t.error, "Não foi possível abrir o ticket.")} onRetry={() => void t.refetch()} />
              ) : !d ? (
                <p className="md-vazio">Carregando…</p>
              ) : (
                <>
                  <div className="md-props">
                    <div>
                      <span>Status</span>
                      {d.status ?? "—"}
                      {d.statusBase && (STATUS_BASE[d.statusBase]?.rotulo ?? d.statusBase) !== d.status ? ` (${STATUS_BASE[d.statusBase]?.rotulo ?? d.statusBase})` : ""}
                    </div>
                    <div><span>Responsável</span>{d.responsavel ?? "Sem responsável"} · {d.equipe ?? "—"}</div>
                    <div><span>Abertura</span>{dataHora(d.criadoEm)}</div>
                    <div><span>Resolvido em</span>{dataHora(d.resolvidoEm)}</div>
                    <div><span>Prazo de solução</span>{dataHora(d.slaSolucaoEm)}</div>
                    <div><span>SLA</span>{sla?.rotulo}</div>
                    <div><span>Origem</span>{d.origem}</div>
                    <div><span>Urgência · categoria</span>{d.urgencia ?? "—"} · {d.categoria ?? "—"}</div>
                    <div><span>Cliente</span>{d.clientes.map((c) => [c.nome, c.organizacao].filter(Boolean).join(" · ")).join("; ") || "—"}</div>
                    <div><span>Atualizado no Movidesk</span>{dataHora(d.atualizadoEm)}</div>
                  </div>

                  <h3 className="md-secao">Ações ({d.acoes.length})</h3>
                  {d.acoes.length === 0 && <p className="md-sub">Nenhuma ação.</p>}
                  {d.acoes.map((a) => (
                    <article key={a.id} className={`md-acao${a.tipo === 1 ? " md-acao--interna" : ""}`}>
                      <header>
                        <b>{a.criadoPor ?? "—"}{a.tipo === 1 ? " · interna" : ""}</b>
                        <span className="md-sub">{dataHora(a.criadoEm)}</span>
                      </header>
                      <p>{a.texto || "(sem texto)"}</p>
                      {(porAcao.get(a.id) ?? []).length > 0 && (
                        <div className="md-anexos">
                          {(porAcao.get(a.id) ?? []).map((x) => (
                            <Anexo key={x.id} anexo={x} />
                          ))}
                        </div>
                      )}
                    </article>
                  ))}

                  {d.historicoStatus.length > 0 && (
                    <>
                      <h3 className="md-secao">Histórico de status</h3>
                      <ul className="md-hist">
                        {d.historicoStatus.map((h, i) => (
                          <li key={i}>{dataHora(h.em)} · {h.status ?? "—"}{h.justificativa ? ` (${h.justificativa})` : ""}{h.por ? ` · ${h.por}` : ""}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {d.historicoResponsavel.length > 0 && (
                    <>
                      <h3 className="md-secao">Histórico de responsável</h3>
                      <ul className="md-hist">
                        {d.historicoResponsavel.map((h, i) => (
                          <li key={i}>{dataHora(h.em)} · {h.responsavel ?? "Sem responsável"} · {h.equipe ?? "—"}{h.por ? ` · por ${h.por}` : ""}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const SITUACAO_ANEXO: Record<AnexoTicket["situacao"], string> = {
  pendente: "na fila para baixar",
  baixando: "baixando…",
  baixado: "",
  erro: "não foi possível baixar",
  grande: "grande demais, não baixado",
};

function Anexo({ anexo }: { anexo: AnexoTicket }) {
  const [abrindo, setAbrindo] = useState(false);
  const abrir = async () => {
    if (!anexo.storagePath) return;
    setAbrindo(true);
    try {
      window.open(await movideskService.urlAnexo(anexo.storagePath, anexo.nome), "_blank", "noopener");
    } catch (e) {
      toast.error(msgErro(e, "Não foi possível abrir o anexo."));
    } finally {
      setAbrindo(false);
    }
  };
  return (
    <div className="md-anexo">
      <Paperclip size={14} aria-hidden="true" />
      {anexo.situacao === "baixado" && anexo.storagePath ? (
        <button type="button" onClick={() => void abrir()} disabled={abrindo}>
          {anexo.nome}
        </button>
      ) : (
        <span>{anexo.nome}</span>
      )}
      <span className="md-sub">{[tamanho(anexo.tamanho), SITUACAO_ANEXO[anexo.situacao]].filter(Boolean).join(" · ")}</span>
    </div>
  );
}
