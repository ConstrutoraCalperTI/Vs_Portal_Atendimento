import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Settings2, SquareKanban } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { DetailBody, DetailDialog, formatDuration, slaTone, Toast, useToast } from "../../../components/ds";
import { getMenuItem } from "../../../config/menuRegistry";
import { EmptyState } from "../../configuracoes/components/EmptyState";
import { ErrorState } from "../../configuracoes/components/ErrorState";
import { CLOSED_WINDOW_DAYS, isClosed } from "../../dashboard/queue";
import type { DashboardTicket } from "../../dashboard/types";
import { ComPainel, useAtualizarTicket } from "../../dashboard/useDashboardData";
import type { DashboardPayload } from "../../dashboard/types";
import { ServiceError } from "../../configuracoes/services/types";
import { useStatusTickets, useVisoesDisponiveis } from "../hooks";
import { rotuloStatus, type StatusTicket } from "../status/types";
import { atendeCondicoes, colunaDoTicket, ordenarTickets } from "../visoes/avaliar";
import { AGRUPAMENTOS, COLUNAS_LISTA } from "../visoes/campos";
import { usePermissoesVisoes } from "../visoes/permissoes";
import type { ColunaKanban, ColunaLista, StatusRef, Visao } from "../visoes/types";
import { coordenadasPorColuna } from "../dnd";
import "./Chamados.css";

// Gestão de Chamados › Tickets: os tickets na visão escolhida (Kanban ou Lista). As visões vêm de
// Configurar visões; o agente vê as das suas equipes. Tickets e mudanças de status ficam no modo
// demonstrativo até existir a tabela de tickets (docs/PLANO-tickets-visoes.md, D7).

const SLA_CLASSE = { red: "ch-badge--danger", amber: "ch-badge--warning", blue: "" } as const;

function SlaBadge({ t }: { t: DashboardTicket }) {
  if (isClosed(t)) return <span className="ch-badge ch-badge--success">{t.status}</span>;
  const m = t.sla_due_minutes;
  return <span className={`ch-badge ${SLA_CLASSE[slaTone(m)]}`}>{`${m < 0 ? "Vencido há" : "Vence em"} ${formatDuration(m)}`}</span>;
}

function Responsavel({ t, meuId }: { t: DashboardTicket; meuId: string }) {
  if (!t.owner) return <span className="ch-badge ch-badge--warning">Não atribuído</span>;
  return (
    <span className="ch-av" title={t.owner.id === meuId ? "Você" : t.owner.name}>
      {t.owner.initials}
    </span>
  );
}

/** Rótulo de um item de coluna: "Aguardando › Retorno do cliente". */
function rotuloRef(ref: StatusRef, status: readonly StatusTicket[]): string {
  const s = status.find((x) => x.id === ref.statusId);
  const j = s?.justificativas.find((x) => x.id === ref.justificativaId);
  return rotuloStatus(s?.nome ?? "?", j?.nome);
}

export function Tickets() {
  return <ComPainel>{(data) => <TicketsConteudo data={data} />}</ComPainel>;
}

function TicketsConteudo({ data }: { data: DashboardPayload }) {
  const me = data.current_user;
  const status = useStatusTickets();
  const visoes = useVisoesDisponiveis(me.id);
  const perm = usePermissoesVisoes();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState("");
  const tickets = data.tickets;
  const atualizar = useAtualizarTicket();
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [escolha, setEscolha] = useState<{ ticketId: number; coluna: ColunaKanban } | null>(null);
  const toast = useToast();
  const now = useMemo(() => new Date(data.generated_at), [data.generated_at]);

  const lista = visoes.data ?? [];
  const visao: Visao | undefined = lista.find((v) => String(v.id) === params.get("visao")) ?? lista.find((v) => v.padrao) ?? lista[0];

  const ctx = useMemo(
    () => ({ userId: me.id, now, servicoNome: (id: number) => data.services.find((s) => s.id === id)?.name ?? "" }),
    [me.id, now, data.services],
  );

  // Encerrados só entram se foram encerrados nos últimos 7 dias (o resto do histórico fica fora do quadro).
  const recentes = useMemo(() => {
    const desde = now.getTime() - CLOSED_WINDOW_DAYS * 86_400_000;
    return tickets.filter((t) => !isClosed(t) || (t.closed_at !== null && Date.parse(t.closed_at) >= desde));
  }, [tickets, now]);

  const daVisao = useMemo(() => {
    if (!visao) return [];
    const q = busca.trim().toLowerCase();
    return recentes
      .filter((t) => atendeCondicoes(t, visao.condicoes, ctx))
      .filter((t) => !q || `${t.id} ${t.subject} ${t.requester}`.toLowerCase().includes(q));
  }, [recentes, visao, busca, ctx]);

  /** D5: quem pode mudar o status (arrastar): admin vê tudo; o agente, os seus e os sem responsável. */
  const podeMover = (t: DashboardTicket) => perm.veTodas || !t.owner || t.owner.id === me.id;

  function aplicarStatus(ticketId: number, ref: StatusRef) {
    const st = status.data?.find((x) => x.id === ref.statusId);
    if (!st) return;
    const j = st.justificativas.find((x) => x.id === ref.justificativaId) ?? null;
    atualizar.mutate(
      { id: ticketId, patch: { statusId: st.id, justificativaId: j?.id ?? null } },
      {
        onSuccess: () => toast.show(`Ticket #${ticketId} agora está em "${rotuloStatus(st.nome, j?.nome)}".`),
        // Resolver pede serviço, campos obrigatórios e a solução aplicada: o banco explica o que falta.
        onError: (e) => toast.show(e instanceof ServiceError ? e.message : "Não foi possível mudar o status."),
      },
    );
  }

  function soltarNaColuna(ticketId: number, coluna: ColunaKanban) {
    if (coluna.status.length === 0) {
      toast.show(`A coluna "${coluna.nome}" não tem status. Peça ao administrador para configurá-la.`);
      return;
    }
    if (coluna.status.length === 1) aplicarStatus(ticketId, coluna.status[0]);
    else setEscolha({ ticketId, coluna });
  }

  if (visoes.isPending || status.isPending) return <PageSkeleton />;
  if (visoes.isError || status.isError) {
    return <ErrorState message="Não foi possível carregar as visões de tickets." onRetry={() => void Promise.all([visoes.refetch(), status.refetch()])} />;
  }

  const configurarPath = `${getMenuItem("gestao_chamados_tickets").path}/visoes${visao ? `?visao=${visao.id}` : ""}`;
  const detalhe = tickets.find((t) => t.id === detalheId);

  return (
    <section aria-label="Tickets">
      <div className="ch-toolbar">
        {lista.length > 0 && (
          <label className="ch-viewsel">
            Visão:
            <select value={visao?.id ?? ""} onChange={(e) => setParams({ visao: e.target.value }, { replace: true })}>
              {lista.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome} ({v.tipo === "kanban" ? "Kanban" : "Lista"})
                </option>
              ))}
            </select>
          </label>
        )}
        <input className="input ch-search" type="search" aria-label="Buscar tickets" placeholder="Buscar nº, assunto ou solicitante..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {visao && <span className="ch-count" aria-live="polite">{daVisao.length} tickets nesta visão</span>}
        <span className="ch-toolbar__spacer" />
        {perm.podeConfigurar && (
          <Link className="btn btn--outline" to={configurarPath}>
            <Settings2 size={16} aria-hidden="true" />
            Configurar visões
          </Link>
        )}
      </div>

      {!visao ? (
        <div className="card">
          <EmptyState
            icon={SquareKanban}
            title="Nenhuma visão para a sua equipe"
            description={perm.podeConfigurar ? "Crie uma visão em Configurar visões." : "Peça ao administrador para criar uma visão para a sua equipe."}
          />
        </div>
      ) : visao.tipo === "kanban" ? (
        <Quadro
          visao={visao}
          tickets={daVisao}
          statusCadastro={status.data}
          meuId={me.id}
          podeMover={podeMover}
          onAbrir={setDetalheId}
          onSoltar={soltarNaColuna}
        />
      ) : (
        <Listagem visao={visao} tickets={daVisao} meuId={me.id} servicoNome={ctx.servicoNome} onAbrir={setDetalheId} />
      )}

      <DetailDialog open={detalhe !== undefined} onOpenChange={(o) => !o && setDetalheId(null)} title={detalhe ? `Ticket #${detalhe.id}` : ""}>
        {detalhe && (
          <DetailBody>
            <h2 className="ds-h2">{detalhe.subject}</h2>
            <p className="ds-muted">
              Solicitante: {detalhe.requester} · Origem: {detalhe.origin} · Recebido em: {detalhe.recebido_em}
            </p>
            <p>
              <span className="ch-badge">{detalhe.team}</span> <span className="ch-badge">{rotuloStatus(detalhe.status, detalhe.justificativa)}</span>{" "}
              <span className="ch-badge">Prioridade {detalhe.prioridade.toLowerCase()}</span>
              {detalhe.tags.map((tag) => (
                <span key={tag} className="ch-badge ch-badge--info" style={{ marginLeft: 4 }}>{tag}</span>
              ))}
            </p>
            <p>{detalhe.description}</p>
            <p>
              <strong>Responsável:</strong> {detalhe.owner ? (detalhe.owner.id === me.id ? "Você" : detalhe.owner.name) : "Não atribuído"}
            </p>
            <p>
              <strong>SLA de solução:</strong> <SlaBadge t={detalhe} />
            </p>
            {podeMover(detalhe) && (
              <label className="field" style={{ marginTop: 6 }}>
                <span className="field__label">Mudar status</span>
                <select
                  className="input"
                  value={`${detalhe.status_id}:${detalhe.justificativa_id ?? ""}`}
                  onChange={(e) => {
                    const [s, j] = e.target.value.split(":");
                    aplicarStatus(detalhe.id, { statusId: Number(s), justificativaId: j ? Number(j) : null });
                  }}
                >
                  {status.data
                    .filter((s) => s.ativo)
                    .flatMap((s) => [
                      <option key={`${s.id}:`} value={`${s.id}:`}>{s.nome}</option>,
                      ...s.justificativas.filter((j) => j.ativa).map((j) => (
                        <option key={`${s.id}:${j.id}`} value={`${s.id}:${j.id}`}>{rotuloStatus(s.nome, j.nome)}</option>
                      )),
                    ])}
                </select>
              </label>
            )}
          </DetailBody>
        )}
      </DetailDialog>

      <DetailDialog
        open={escolha !== null}
        onOpenChange={(o) => !o && setEscolha(null)}
        title={escolha ? `Mover #${escolha.ticketId} para "${escolha.coluna.nome}"` : ""}
        description="Esta coluna tem mais de um status. Escolha qual aplicar."
        closeLabel="Cancelar"
      >
        {escolha && (
          <div className="ch-choices">
            {escolha.coluna.status.map((ref) => (
              <button
                key={`${ref.statusId}:${ref.justificativaId}`}
                type="button"
                className="ch-choice"
                onClick={() => {
                  aplicarStatus(escolha.ticketId, ref);
                  setEscolha(null);
                }}
              >
                {rotuloRef(ref, status.data)}
              </button>
            ))}
          </div>
        )}
      </DetailDialog>

      <Toast message={toast.message} />
    </section>
  );
}

// ---------- Kanban ----------

interface QuadroProps {
  visao: Visao;
  tickets: DashboardTicket[];
  statusCadastro: StatusTicket[];
  meuId: string;
  podeMover: (t: DashboardTicket) => boolean;
  onAbrir: (id: number) => void;
  onSoltar: (ticketId: number, coluna: ColunaKanban) => void;
}

function Quadro({ visao, tickets, statusCadastro, meuId, podeMover, onAbrir, onSoltar }: QuadroProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: coordenadasPorColuna }));
  const [arrastando, setArrastando] = useState<DashboardTicket | null>(null);
  const arrastavel = visao.kanban.arrastar === "mudar_status";
  const colunas = visao.kanban.colunas;

  const porColuna = useMemo(() => {
    const mapa = new Map<string, DashboardTicket[]>(colunas.map((c) => [c.id, []]));
    for (const t of ordenarTickets(tickets, visao.kanban.ordenar)) {
      const col = colunaDoTicket(t, colunas);
      if (col) mapa.get(col)?.push(t);
    }
    return mapa;
  }, [tickets, colunas, visao.kanban.ordenar]);

  const inicio = (e: DragStartEvent) => setArrastando(tickets.find((t) => t.id === e.active.id) ?? null);
  const fim = (e: DragEndEvent) => {
    setArrastando(null);
    const destino = colunas.find((c) => c.id === e.over?.id);
    const t = tickets.find((x) => x.id === e.active.id);
    if (!destino || !t || colunaDoTicket(t, colunas) === destino.id) return;
    onSoltar(t.id, destino);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={inicio}
      onDragEnd={fim}
      onDragCancel={() => setArrastando(null)}
      accessibility={{
        screenReaderInstructions: { draggable: "Para mover o ticket, pressione espaço, use ← e → para escolher a coluna e espaço de novo para soltar. Esc cancela." },
      }}
    >
      <div className="ch-board">
        {colunas.map((c) => (
          <Coluna key={c.id} coluna={c} tickets={porColuna.get(c.id) ?? []} statusCadastro={statusCadastro}>
            {(porColuna.get(c.id) ?? []).map((t) => (
              <Cartao key={t.id} t={t} meuId={meuId} arrastavel={arrastavel && podeMover(t)} onAbrir={onAbrir} />
            ))}
          </Coluna>
        ))}
      </div>
      <DragOverlay>{arrastando && <CartaoConteudo t={arrastando} meuId={meuId} overlay onAbrir={() => undefined} />}</DragOverlay>
    </DndContext>
  );
}

function Coluna({ coluna, tickets, statusCadastro, children }: { coluna: ColunaKanban; tickets: DashboardTicket[]; statusCadastro: StatusTicket[]; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  return (
    <section ref={setNodeRef} className={`ch-col${isOver ? " ch-col--over" : ""}`} aria-label={`${coluna.nome}: ${tickets.length} tickets`}>
      <div className="ch-col__head">
        {coluna.nome}
        <span className="ch-col__count">{tickets.length}</span>
      </div>
      {coluna.status.length > 0 && <div className="ch-col__sub">{coluna.status.map((r) => rotuloRef(r, statusCadastro)).join(" · ")}</div>}
      {children}
    </section>
  );
}

function Cartao({ t, meuId, arrastavel, onAbrir }: { t: DashboardTicket; meuId: string; arrastavel: boolean; onAbrir: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !arrastavel });
  return (
    <div ref={setNodeRef} {...(arrastavel ? { ...attributes, ...listeners } : {})} className={isDragging ? "ch-card--dragging" : undefined}>
      <CartaoConteudo t={t} meuId={meuId} arrastavel={arrastavel} onAbrir={onAbrir} />
    </div>
  );
}

function CartaoConteudo({ t, meuId, arrastavel = false, overlay = false, onAbrir }: { t: DashboardTicket; meuId: string; arrastavel?: boolean; overlay?: boolean; onAbrir: (id: number) => void }) {
  return (
    <article className={`ch-card${arrastavel ? " ch-card--drag" : ""}${overlay ? " ch-card--overlay" : ""}`}>
      <div className="ch-card__meta">
        <span>
          <span className="ch-mono">#{t.id}</span> · {t.requester}
        </span>
        <span>{t.team}</span>
      </div>
      <button type="button" className="ch-card__subject" onClick={() => onAbrir(t.id)} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {t.subject}
      </button>
      <div className="ch-card__row">
        <SlaBadge t={t} />
        <Responsavel t={t} meuId={meuId} />
      </div>
      {t.justificativa && <div className="ch-card__meta">{rotuloStatus(t.status, t.justificativa)}</div>}
    </article>
  );
}

// ---------- Lista agrupada ----------

function valorGrupo(t: DashboardTicket, por: NonNullable<Visao["agrupamento"]["por"]>, meuId: string, servicoNome: (id: number) => string): string {
  switch (por) {
    case "equipe":
      return t.team || "Sem equipe";
    case "responsavel":
      return t.owner ? (t.owner.id === meuId ? "Você" : t.owner.name) : "Não atribuído";
    case "status":
      return rotuloStatus(t.status, t.justificativa);
    case "servico":
      return servicoNome(t.service_id);
    case "origem":
      return t.origin;
    case "prioridade":
      return t.prioridade;
  }
}

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function Celula({ coluna, t, meuId, servicoNome }: { coluna: ColunaLista; t: DashboardTicket; meuId: string; servicoNome: (id: number) => string }) {
  switch (coluna) {
    case "solicitante":
      return <>{t.requester}</>;
    case "status":
      return <span className="ch-badge">{rotuloStatus(t.status, t.justificativa)}</span>;
    case "responsavel":
      return t.owner ? <>{t.owner.id === meuId ? "Você" : t.owner.name}</> : <span className="ch-badge ch-badge--warning">Não atribuído</span>;
    case "sla":
      return <SlaBadge t={t} />;
    case "origem":
      return <span className="ch-badge">{t.origin}</span>;
    case "servico":
      return <>{servicoNome(t.service_id)}</>;
    case "equipe":
      return <>{t.team}</>;
    case "prioridade":
      return <>{t.prioridade}</>;
    case "criado":
      return <>{DATA.format(new Date(t.criado_em))}</>;
  }
}

function Listagem({ visao, tickets, meuId, servicoNome, onAbrir }: { visao: Visao; tickets: DashboardTicket[]; meuId: string; servicoNome: (id: number) => string; onAbrir: (id: number) => void }) {
  const [pagina, setPagina] = useState(0);
  const { por, ordemGrupos, ordenar, porPagina, colunas } = visao.agrupamento;
  const ordenados = ordenarTickets(tickets, ordenar);

  const grupos = useMemo(() => {
    if (!por) return [{ nome: "", itens: ordenados }];
    const mapa = new Map<string, DashboardTicket[]>();
    for (const t of ordenados) {
      const k = valorGrupo(t, por, meuId, servicoNome);
      mapa.set(k, [...(mapa.get(k) ?? []), t]);
    }
    return [...mapa]
      .map(([nome, itens]) => ({ nome, itens }))
      .sort((a, b) => (ordemGrupos === "quantidade" ? b.itens.length - a.itens.length : 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [ordenados, por, ordemGrupos, meuId, servicoNome]);

  // Pagina sobre a lista já agrupada; o cabeçalho do grupo repete na página seguinte.
  const linhas = grupos.flatMap((g) => g.itens.map((t) => ({ grupo: g.nome, total: g.itens.length, t })));
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / porPagina));
  const atual = Math.min(pagina, totalPaginas - 1);
  const visiveis = linhas.slice(atual * porPagina, (atual + 1) * porPagina);

  if (tickets.length === 0) return <p className="ch-empty card">Nenhum ticket atende a esta visão agora.</p>;

  return (
    <>
      <div className="ch-table-wrap">
        <table className="ch-table">
          <thead>
            <tr>
              <th scope="col">Ticket</th>
              {colunas.map((c) => (
                <th key={c} scope="col">{COLUNAS_LISTA[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ grupo, total, t }, i) => (
              <FragmentoLinha key={t.id} mostrarGrupo={Boolean(por) && (i === 0 || visiveis[i - 1].grupo !== grupo)} grupo={grupo} total={total} colSpan={colunas.length + 1} rotuloGrupo={por ? AGRUPAMENTOS[por] : ""}>
                <tr>
                  <td>
                    <span className="ch-mono ch-muted" style={{ fontSize: 12 }}>#{t.id}</span>
                    <br />
                    <button type="button" className="ch-link" onClick={() => onAbrir(t.id)}>{t.subject}</button>
                  </td>
                  {colunas.map((c) => (
                    <td key={c}>
                      <Celula coluna={c} t={t} meuId={meuId} servicoNome={servicoNome} />
                    </td>
                  ))}
                </tr>
              </FragmentoLinha>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ch-pager">
        <span aria-live="polite">
          {atual * porPagina + 1}–{Math.min((atual + 1) * porPagina, linhas.length)} de {linhas.length} tickets
        </span>
        <span>
          <button type="button" className="icon-btn icon-btn--bordered" aria-label="Página anterior" disabled={atual === 0} onClick={() => setPagina(atual - 1)}>←</button>{" "}
          <button type="button" className="icon-btn icon-btn--bordered" aria-label="Próxima página" disabled={atual >= totalPaginas - 1} onClick={() => setPagina(atual + 1)}>→</button>
        </span>
      </div>
    </>
  );
}

function FragmentoLinha({ mostrarGrupo, grupo, total, colSpan, rotuloGrupo, children }: { mostrarGrupo: boolean; grupo: string; total: number; colSpan: number; rotuloGrupo: string; children: ReactNode }) {
  return (
    <>
      {mostrarGrupo && (
        <tr className="ch-table__group">
          <td colSpan={colSpan}>
            <span className="visually-hidden">{rotuloGrupo}: </span>
            {grupo}
            <small>{total} tickets</small>
          </td>
        </tr>
      )}
      {children}
    </>
  );
}
