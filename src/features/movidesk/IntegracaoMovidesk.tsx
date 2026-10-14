import * as Switch from "@radix-ui/react-switch";
import { KeyRound, PlugZap, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageSkeleton } from "../../components/PageSkeleton";
import { ErrorState } from "../configuracoes/components/ErrorState";
import { StatusBadge } from "../configuracoes/components/StatusBadge";
import { ServiceError } from "../configuracoes/services/types";
import {
  useAnexosDeNovoMovidesk,
  useConfigMovidesk,
  useExecucoesMovidesk,
  useRecomecarMovidesk,
  useSalvarConfigMovidesk,
  useSalvarTokenMovidesk,
  useSincronizarMovidesk,
  useTestarMovidesk,
} from "./hooks";
import type { ConfigMovidesk, Etapa, SalvarConfig } from "./service";
import "./movidesk.css";

// Configurações › Integrações › Movidesk (só Super admin): token no cofre, rotas, agenda da sincronização, anexos e execuções.

const msgErro = (e: unknown, padrao: string) => (e instanceof ServiceError ? e.message : padrao);
const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const gb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const n = (v: number) => v.toLocaleString("pt-BR");

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const RECORRENCIAS = [1, 5, 10, 30, 60];
const rotuloRec = (m: number) => (m === 60 ? "A cada 1 hora" : `A cada ${m} minuto${m === 1 ? "" : "s"}`);

const ETAPAS: { id: Etapa; titulo: string; rota: string }[] = [
  { id: "recentes", titulo: "1 · Últimos 90 dias", rota: "/tickets por id" },
  { id: "past", titulo: "2 · Histórico antigo", rota: "/tickets/past por id" },
  { id: "incremental", titulo: "3 · Incremental", rota: "/tickets por lastUpdate" },
];

export function IntegracaoMovidesk() {
  const q = useConfigMovidesk();
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState message={msgErro(q.error, "Não foi possível carregar a integração com o Movidesk.")} onRetry={() => void q.refetch()} />;
  return <Tela c={q.data} />;
}

function Tela({ c }: { c: ConfigMovidesk }) {
  return (
    <>
      <div className="md-grade2">
        <Conexao c={c} />
        <Campos c={c} />
      </div>
      <Rotas />
      <Sincronizacao c={c} />
      <Execucoes />
    </>
  );
}

function Conexao({ c }: { c: ConfigMovidesk }) {
  const ids = useId();
  const salvarToken = useSalvarTokenMovidesk();
  const testar = useTestarMovidesk();
  const [token, setToken] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const t = c.ultimoTeste;
  const oks = t?.rotas.filter((r) => r.ok).length ?? 0;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    salvarToken.mutate(token, {
      onSuccess: () => {
        setToken("");
        toast.success("Token salvo no cofre");
      },
      onError: (er) => (er instanceof ServiceError && er.field ? setErro(er.message) : toast.error(msgErro(er, "Não foi possível salvar o token."))),
    });
  };

  return (
    <section className="card md-card" aria-labelledby={`${ids}-t`}>
      <div className="md-head">
        <h2 id={`${ids}-t`}>Conexão</h2>
        <span className="md-spacer" />
        {c.tokenFinal ? <StatusBadge variant={t && oks < t.rotas.length ? "danger" : "success"}>{t && oks < t.rotas.length ? "Com erro" : "Token salvo"}</StatusBadge> : <StatusBadge variant="warning">Sem token</StatusBadge>}
      </div>
      <div className="md-form">
        <div className="field">
          <span className="field__label">Endereço da API</span>
          <span className="md-mono">https://api.movidesk.com/public/v1</span>
        </div>
        <p className="field__help" style={{ margin: 0 }}>
          {c.tokenFinal ? <>Token guardado no cofre do Supabase (termina em <b>{c.tokenFinal}</b>) · {dataHora(c.tokenDefinidoEm)}. Ele nunca chega ao navegador.</> : "Nenhum token salvo ainda."}
        </p>
        <form className="field" onSubmit={enviar} noValidate>
          <label className="field__label" htmlFor={`${ids}-tk`}>{c.tokenFinal ? "Trocar token" : "Token da API"}</label>
          <div className="md-linha">
            <input
              id={`${ids}-tk`}
              className="input"
              style={{ flex: 1, minWidth: 220 }}
              type="password"
              autoComplete="off"
              placeholder="Cole o token (36 caracteres)"
              value={token}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? `${ids}-tk-e` : `${ids}-tk-h`}
              onChange={(e) => setToken(e.target.value)}
            />
            <button type="submit" className="btn btn--primary" disabled={!token.trim() || salvarToken.isPending}>
              <KeyRound size={15} aria-hidden="true" />
              Salvar token
            </button>
          </div>
          {erro ? <span id={`${ids}-tk-e`} className="field__error" role="alert">{erro}</span> : <span id={`${ids}-tk-h`} className="field__help">Se colar da URL, o "&amp;$" do fim é removido sozinho.</span>}
        </form>
        <div className="md-linha">
          <button
            type="button"
            className="btn btn--outline"
            disabled={!c.tokenFinal || testar.isPending}
            onClick={() => testar.mutate(undefined, { onSuccess: (r) => toast.success(`${r.rotas.filter((x) => x.ok).length} de ${r.rotas.length} rotas OK`), onError: (e) => toast.error(msgErro(e, "Falha ao testar.")) })}
          >
            <PlugZap size={15} aria-hidden="true" />
            {testar.isPending ? "Testando (até 1 min)…" : "Testar conexão"}
          </button>
        </div>
        {t && (
          <div className={oks === t.rotas.length ? "md-nota" : "md-alerta"} role="status">
            Último teste: {dataHora(t.em)} · <b>{oks} de {t.rotas.length} rotas OK</b>
            {t.rotas.filter((r) => !r.ok).map((r) => (
              <div key={r.nome}>{r.nome}: {r.erro ?? `HTTP ${r.http}`}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Campos({ c }: { c: ConfigMovidesk }) {
  const ids = useId();
  const salvar = useSalvarConfigMovidesk();
  const [select, setSelect] = useState(c.select);
  const [expand, setExpand] = useState(c.expand);
  useEffect(() => {
    setSelect(c.select);
    setExpand(c.expand);
  }, [c.select, c.expand]);
  const mudou = select !== c.select || expand !== c.expand;

  return (
    <section className="card md-card" aria-labelledby={`${ids}-c`}>
      <div className="md-head">
        <div>
          <h2 id={`${ids}-c`}>Campos e expansões</h2>
          <small>Iguais para as 3 rotas · 100 tickets por página ($top, máximo da API)</small>
        </div>
      </div>
      <form
        className="md-form"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate({ ...c.agenda, select, expand }, { onSuccess: () => toast.success("Campos salvos"), onError: (er) => toast.error(msgErro(er, "Não foi possível salvar.")) });
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-s`}>$select</label>
          <textarea id={`${ids}-s`} className="input md-mono" rows={5} value={select} onChange={(e) => setSelect(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-e`}>$expand</label>
          <textarea id={`${ids}-e`} className="input md-mono" rows={3} value={expand} onChange={(e) => setExpand(e.target.value)} />
        </div>
        <div className="md-linha" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn--primary" disabled={!mudou || salvar.isPending}>
            <Save size={15} aria-hidden="true" />
            Salvar campos
          </button>
        </div>
      </form>
    </section>
  );
}

function Rotas() {
  const ids = useId();
  return (
    <section className="card md-card" aria-labelledby={`${ids}-r`}>
      <div className="md-head">
        <div>
          <h2 id={`${ids}-r`}>Rotas</h2>
          <small>O token entra só na hora da chamada, no servidor</small>
        </div>
      </div>
      <div className="md-form">
        <div className="md-rota">
          <b>1 · Tickets recentes (alterados nos últimos 90 dias)</b>
          <code>GET /tickets?$select=…&amp;$expand=…&amp;$filter=id gt {"{último id}"}&amp;$orderby=id asc&amp;$top=100</code>
        </div>
        <div className="md-rota">
          <b>2 · Carga histórica (sem alteração há mais de 90 dias)</b>
          <code>GET /tickets/past?$select=…&amp;$expand=…&amp;$filter=id gt {"{último id}"}&amp;$orderby=id asc&amp;$top=100</code>
        </div>
        <div className="md-rota">
          <b>3 · Incremental (o que mudou desde a última passada, em UTC)</b>
          <code>GET /tickets?$select=…&amp;$expand=…&amp;$filter=lastUpdate ge {"{desde}"} and id gt {"{último id}"}&amp;$orderby=id asc&amp;$top=100</code>
        </div>
        <div className="md-rota">
          <b>4 · Anexos</b>
          <code>GET /storage/download?id={"{caminho do anexo}"}</code>
          <span className="md-sub">O arquivo vai para o bucket privado movidesk-anexos do Supabase.</span>
        </div>
      </div>
    </section>
  );
}

function Sincronizacao({ c }: { c: ConfigMovidesk }) {
  const ids = useId();
  const salvar = useSalvarConfigMovidesk();
  const sincronizar = useSincronizarMovidesk();
  const recomecar = useRecomecarMovidesk();
  const deNovo = useAnexosDeNovoMovidesk();
  const [a, setA] = useState(c.agenda);
  const [erro, setErro] = useState<{ campo: string; msg: string } | null>(null);
  useEffect(() => setA(c.agenda), [c.agenda]);
  const e = c.estado;
  const mudou = JSON.stringify(a) !== JSON.stringify(c.agenda);
  const ordem = ETAPAS.findIndex((x) => x.id === e.etapa);
  const maior = e.maiorIdMovidesk ?? 0;
  // Ids não são contínuos (~60% viram ticket): estimativa grosseira de páginas restantes pelo cursor.
  const restantes = maior ? Math.max(0, Math.round(((maior - (e.etapa === "recentes" ? e.cursorRecentesId : 0)) * 0.6) / 100)) : null;
  const horas = restantes !== null && e.mediaMsPagina ? Math.round((restantes * Math.max(e.mediaMsPagina, 60_000)) / 3_600_000) : null;
  const anx = c.anexos;

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    setErro(null);
    const p: SalvarConfig = { ...a, select: c.select, expand: c.expand };
    salvar.mutate(p, {
      onSuccess: () => toast.success(a.ativo ? "Agenda salva e ligada" : "Agenda salva (desligada)"),
      onError: (er) => (er instanceof ServiceError && er.field ? setErro({ campo: er.field, msg: er.message }) : toast.error(msgErro(er, "Não foi possível salvar a agenda."))),
    });
  };

  return (
    <section className="card md-card" aria-labelledby={`${ids}-s`}>
      <div className="md-head">
        <div>
          <h2 id={`${ids}-s`}>Sincronização</h2>
          <small>Primeiro a carga completa (etapas 1 e 2). Quando ela termina, passa sozinha para o incremental.</small>
        </div>
        <span className="md-spacer" />
        {e.rodando && <StatusBadge variant="info">Rodando agora</StatusBadge>}
        <button
          type="button"
          className="btn btn--outline"
          disabled={!c.tokenFinal || sincronizar.isPending || e.rodando}
          onClick={() => sincronizar.mutate(undefined, { onSuccess: () => toast.success("Sincronização iniciada (cerca de 1 minuto)"), onError: (er) => toast.error(msgErro(er, "Não foi possível sincronizar.")) })}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Sincronizar agora
        </button>
      </div>

      <div className="md-etapas">
        {ETAPAS.map((x, i) => (
          <div key={x.id} className={`md-etapa${x.id === e.etapa ? " md-etapa--on" : ""}`}>
            <h4>{x.titulo}</h4>
            <span className="md-sub">{x.rota}</span>
            <div className="md-barra" aria-hidden="true">
              <i style={{ width: `${i < ordem ? 100 : i > ordem ? 0 : x.id === "recentes" && maior ? Math.min(100, Math.round((e.cursorRecentesId / maior) * 100)) : x.id === "incremental" ? 100 : 5}%` }} />
            </div>
            <small className="md-sub">
              {i < ordem ? "Concluída" : i > ordem ? "Aguardando a etapa anterior" : x.id === "incremental" ? `Desde ${dataHora(e.incrementalDesde)}` : `Último id: ${n(x.id === "past" ? e.cursorPastId : e.cursorRecentesId)}`}
            </small>
          </div>
        ))}
      </div>
      <div className="md-kpis">
        <div className="md-kpi"><b>{n(e.totalTickets)}</b><span>tickets na base</span></div>
        <div className="md-kpi"><b>{e.mediaMsPagina ? `~${Math.round(e.mediaMsPagina / 1000)} s` : "—"}</b><span>média por página de 100</span></div>
        <div className="md-kpi"><b>{e.cargaConcluidaEm ? "Concluída" : horas !== null ? `~${n(horas)} h` : "—"}</b><span>{e.cargaConcluidaEm ? dataHora(e.cargaConcluidaEm) : "estimativa da carga (sem pausas)"}</span></div>
        <div className="md-kpi"><b>{dataHora(e.ultimaRodadaEm)}</b><span>última rodada</span></div>
      </div>

      <form className="md-form" onSubmit={enviar} noValidate style={{ borderTop: "1px solid var(--line)" }}>
        <label className="md-switch">
          <Switch.Root className="switch" checked={a.ativo} onCheckedChange={(v) => setA({ ...a, ativo: v })} aria-describedby={`${ids}-at`}>
            <Switch.Thumb className="switch__thumb" />
          </Switch.Root>
          <span>Agenda ligada</span>
        </label>
        <span id={`${ids}-at`} className="field__help" style={{ marginTop: -8 }}>Desligada, só o "Sincronizar agora" busca tickets e anexos.</span>
        <div className="md-dois">
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-ini`}>Horário inicial</label>
            <input id={`${ids}-ini`} className="input" type="time" value={a.janelaInicio} onChange={(ev) => setA({ ...a, janelaInicio: ev.target.value })} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-fim`}>Horário final</label>
            <input id={`${ids}-fim`} className="input" type="time" value={a.janelaFim} aria-invalid={erro?.campo === "janelaFim" || undefined} onChange={(ev) => setA({ ...a, janelaFim: ev.target.value })} />
            {erro?.campo === "janelaFim" && <span className="field__error" role="alert">{erro.msg}</span>}
          </div>
        </div>
        <span className="field__help" style={{ marginTop: -8 }}>Horário de Brasília. Janela que passa da meia-noite vale (19:00 → 07:00).</span>
        <div className="md-dois">
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-rec`}>Recorrência da carga</label>
            <select id={`${ids}-rec`} className="input" value={a.recorrenciaMin} onChange={(ev) => setA({ ...a, recorrenciaMin: Number(ev.target.value) })}>
              {RECORRENCIAS.map((m) => <option key={m} value={m}>{rotuloRec(m)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-pg`}>Páginas por rodada</label>
            <select id={`${ids}-pg`} className="input" value={a.paginasPorRodada} onChange={(ev) => setA({ ...a, paginasPorRodada: Number(ev.target.value) })}>
              <option value={1}>1 página (100 tickets)</option>
              <option value={2}>2 páginas</option>
              <option value={3}>3 páginas</option>
            </select>
          </div>
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Dias da semana</legend>
          <div className="md-dias">
            {DIAS.map((d, i) => (
              <label key={d}>
                <input
                  type="checkbox"
                  checked={a.dias.includes(i)}
                  onChange={(ev) => setA({ ...a, dias: ev.target.checked ? [...a.dias, i].sort() : a.dias.filter((x) => x !== i) })}
                />
                {d}
              </label>
            ))}
          </div>
          {erro?.campo === "dias" && <span className="field__error" role="alert">{erro.msg}</span>}
        </fieldset>
        <div className="md-dois">
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-inc`}>Incremental (depois da carga)</label>
            <select id={`${ids}-inc`} className="input" value={a.incrementalDiaTodo ? "dia" : "janela"} onChange={(ev) => setA({ ...a, incrementalDiaTodo: ev.target.value === "dia" })}>
              <option value="dia">O dia todo</option>
              <option value="janela">Só na mesma janela e dias</option>
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-irec`}>Recorrência do incremental</label>
            <select id={`${ids}-irec`} className="input" value={a.incrementalRecorrenciaMin} onChange={(ev) => setA({ ...a, incrementalRecorrenciaMin: Number(ev.target.value) })}>
              {RECORRENCIAS.map((m) => <option key={m} value={m}>{rotuloRec(m)}</option>)}
            </select>
          </div>
        </div>

        <h3 className="md-secao" style={{ marginBottom: 0 }}>Anexos</h3>
        <label className="md-switch">
          <Switch.Root className="switch" checked={a.baixarAnexos} onCheckedChange={(v) => setA({ ...a, baixarAnexos: v })}>
            <Switch.Thumb className="switch__thumb" />
          </Switch.Root>
          <span>Baixar os anexos dos tickets</span>
        </label>
        <div className="md-dois">
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-max`}>Tamanho máximo por arquivo</label>
            <select id={`${ids}-max`} className="input" value={a.anexoMaxMb} onChange={(ev) => setA({ ...a, anexoMaxMb: Number(ev.target.value) })}>
              {[5, 10, 25, 50].map((m) => <option key={m} value={m}>{m} MB</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Progresso</span>
            <span>
              {n(anx.baixados)} de {n(anx.total)} baixados · {gb(anx.bytes)}
              <span className="md-sub">
                {n(anx.pendentes)} na fila · {n(anx.erros)} com erro · {n(anx.grandes)} grandes demais
              </span>
            </span>
          </div>
        </div>
        <div className="md-nota">
          Os anexos são baixados na mesma rodada dos tickets, 4 de cada vez, e ficam no Storage do Supabase (bucket privado). Medido em 14/10/2026: ~2,5 anexos por ticket e ~1 MB por arquivo, o que dá ~250 GB na base inteira.
        </div>

        <div className="md-linha" style={{ justifyContent: "flex-end" }}>
          {anx.erros > 0 && (
            <button type="button" className="btn btn--outline" disabled={deNovo.isPending} onClick={() => deNovo.mutate(undefined, { onSuccess: (q) => toast.success(`${n(q)} anexos voltaram para a fila`) })}>
              Tentar de novo os anexos com erro
            </button>
          )}
          <button
            type="button"
            className="btn btn--outline"
            disabled={recomecar.isPending}
            onClick={() => {
              if (window.confirm("Recomeçar a carga do zero? Os tickets já gravados continuam e são atualizados de novo.")) {
                recomecar.mutate(undefined, { onSuccess: () => toast.success("A carga recomeça na próxima rodada") });
              }
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Recomeçar do zero…
          </button>
          <button type="submit" className="btn btn--primary" disabled={!mudou || salvar.isPending}>
            <Save size={15} aria-hidden="true" />
            Salvar agenda
          </button>
        </div>
      </form>
    </section>
  );
}

function Execucoes() {
  const ids = useId();
  const [soErros, setSoErros] = useState(false);
  const q = useExecucoesMovidesk(soErros);
  return (
    <section className="card md-card" aria-labelledby={`${ids}-x`}>
      <div className="md-head">
        <div>
          <h2 id={`${ids}-x`}>Execuções</h2>
          <small>Últimos 7 dias (até 100)</small>
        </div>
        <span className="md-spacer" />
        <label className="visually-hidden" htmlFor={`${ids}-f`}>Mostrar</label>
        <select id={`${ids}-f`} className="input" style={{ width: "auto" }} value={soErros ? "erro" : "todas"} onChange={(e) => setSoErros(e.target.value === "erro")}>
          <option value="todas">Todas</option>
          <option value="erro">Com erro</option>
        </select>
      </div>
      {q.isError ? (
        <ErrorState bare message="Não foi possível carregar as execuções." onRetry={() => void q.refetch()} />
      ) : (
        <div className="md-tabela-wrap">
          <table className="md-tabela">
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Etapa</th>
                <th scope="col">Tickets</th>
                <th scope="col">Tempo</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).length === 0 && (
                <tr><td colSpan={5} className="md-vazio">{q.isPending ? "Carregando…" : "Nenhuma execução."}</td></tr>
              )}
              {(q.data ?? []).map((x) => (
                <tr key={x.id} style={{ cursor: "default" }}>
                  <td>{dataHora(x.em)}<span className="md-sub">{x.origem === "agenda" ? "agenda" : x.origem === "manual" ? "manual" : "teste"}</span></td>
                  <td>{x.origem === "teste" ? x.etapa : x.etapa === "recentes" ? "Últimos 90 dias" : x.etapa === "past" ? "Histórico antigo" : "Incremental"}{x.filtro && <span className="md-sub md-mono">{x.filtro}</span>}</td>
                  <td>{n(x.tickets)}</td>
                  <td>{x.ms !== null ? `${Math.round(x.ms / 1000)} s` : "—"}{x.kb ? <span className="md-sub">{n(x.kb)} KB</span> : null}</td>
                  <td>
                    <StatusBadge variant={x.ok ? "success" : "danger"}>{x.ok ? "OK" : x.http ? `HTTP ${x.http}` : "Erro"}</StatusBadge>
                    {x.erro && <span className="md-sub">{x.erro}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
