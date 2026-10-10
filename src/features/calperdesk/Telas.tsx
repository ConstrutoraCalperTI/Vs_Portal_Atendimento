import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ChevronRight, ClipboardList, Lightbulb, Megaphone, MessageCircle, PlusCircle, User } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { Cabecalho, Carregando, SubCabecalho, useCd } from "./CalperDeskApp";
import { calperdesk, formatarTelefone, iniciais, type Aviso, type ChamadoResumo, type Departamento } from "./service";

// ---------- utilitários de exibição ----------

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DIA_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** "há 5 min", "hoje 08:44", "02/10 14:00". */
export function quando(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min >= 0 && min < 1) return "agora";
  if (min >= 0 && min < 60) return `há ${min} min`;
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return `hoje ${HORA.format(d)}`;
  return DIA_HORA.format(d);
}

/** "hoje até 11:30" / "até 02/10 14:00". */
export function prazo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? `hoje até ${HORA.format(d)}` : `até ${DIA_HORA.format(d)}`;
}

export const dia = (iso: string | null | undefined) => (iso ? DIA.format(new Date(iso)) : "");

export function Status({ s }: { s: ChamadoResumo["status"] }) {
  const rotulo = s.categoria === "novo" ? "Aberto" : s.nome;
  return <span className={`cd-st cd-st--${s.categoria}`}>{rotulo}</span>;
}

export function CartaoChamado({ c }: { c: ChamadoResumo }) {
  const fechado = c.encerradoEm !== null;
  return (
    <Link to={`/app/chamados/${c.id}`} className={`cd-card${c.novo ? " cd-card--novo" : ""}${fechado ? " cd-card--fechado" : ""}`}>
      <div className="cd-card__l1">
        <span>
          #{c.id} · {c.servico ? c.servico.split(" › ").pop() : c.setor}
        </span>
        <Status s={c.status} />
      </div>
      <h3>{c.assunto}</h3>
      <p>
        {c.novo && <span className="cd-novo">● Nova resposta · </span>}
        {c.ultima && c.ultima.direcao === "saida"
          ? `${c.ultima.autor}: ${c.ultima.texto}`
          : fechado
            ? `Encerrado em ${dia(c.encerradoEm)}`
            : c.responsavel
              ? `Com ${c.responsavel}`
              : c.slaRespostaAte
                ? `Aguardando a equipe · resposta ${prazo(c.slaRespostaAte)}`
                : "Aguardando a equipe"}
        {c.ultima && ` · ${quando(c.ultima.em)}`}
      </p>
    </Link>
  );
}

/** Departamento da URL (/app/d/:setorId); null se não existir ou não estiver no app. */
function useDepartamento(): Departamento | null {
  const { setorId } = useParams();
  const { entrada } = useCd();
  return entrada.setores.find((s) => String(s.id) === setorId) ?? null;
}

const ARTE: Record<Aviso["tipo"], string> = { manutencao: "🛠️", alerta: "⚠️", resolvido: "✅", comunicado: "📣" };
const TIPO: Record<Aviso["tipo"], string> = { manutencao: "Manutenção", alerta: "Alerta", resolvido: "Resolvido", comunicado: "Comunicado" };

// ---------- telas ----------

/** 1ª tela: identificação (do login) e escolha do departamento. */
export function Departamentos() {
  const { entrada } = useCd();
  const primeiro = entrada.nome.split(" ")[0];
  return (
    <>
      <Cabecalho />
      <div className="cd-bv">
        <h1>Olá, {primeiro} 👋</h1>
        <p>Com qual departamento você precisa falar?</p>
      </div>
      <div className="cd-ident">
        <span className="cd-av" aria-hidden="true">
          {iniciais(entrada.nome)}
        </span>
        <div>
          <b>{entrada.nome}</b>
          <span>{entrada.email}</span>
          <span>
            {entrada.telefone ? `📱 ${formatarTelefone(entrada.telefone)} · corporativo` : <Link to="/app/perfil">📱 Cadastre seu telefone corporativo</Link>}
          </span>
          <em>✓ IDENTIFICADO PELO SEU LOGIN</em>
        </div>
      </div>
      {entrada.setores.length === 0 ? (
        <p className="cd-vazio">Nenhum departamento disponível no app ainda. Fale com a TI.</p>
      ) : (
        <nav className="cd-deptos" aria-label="Departamentos">
          {entrada.setores.map((s) => (
            <Link key={s.id} to={`/app/d/${s.id}`} className="cd-depto">
              <span className="cd-depto__icone" aria-hidden="true">
                {s.icone}
              </span>
              <span>
                <b>{s.nome}</b>
                {s.descricao && <small>{s.descricao}</small>}
              </span>
              <ChevronRight className="cd-depto__seta" size={20} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      )}
      <p className="cd-vazio" style={{ paddingTop: 0 }}>
        Você pode trocar de departamento a qualquer momento no topo do app.
        <br />
        <Link to="/app/chamados" style={{ color: "var(--cd-ouro)" }}>
          Ver meus chamados
        </Link>
      </p>
    </>
  );
}

function Carrossel({ avisos, setor }: { avisos: Aviso[]; setor: Departamento }) {
  const [i, setI] = useState(0);
  const total = avisos.length;
  useEffect(() => {
    if (total < 2) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % total), 6000);
    return () => window.clearInterval(t);
  }, [total]);
  const a = avisos[i % Math.max(total, 1)];
  if (!a) {
    return (
      <div className="cd-hero">
        <div className="cd-hero__arte" aria-hidden="true">
          {setor.icone}
        </div>
        <div className="cd-hero__txt">
          <small>{setor.nome}</small>
          <h2>Tudo funcionando por aqui</h2>
          <p>Sem avisos no momento. Precisa de algo? Abra um chamado e acompanhe por aqui.</p>
        </div>
      </div>
    );
  }
  return (
    <section className={`cd-hero cd-hero--${a.tipo}`} aria-roledescription="carrossel" aria-label={`Avisos de ${setor.nome}`}>
      <div className="cd-hero__arte" aria-hidden="true">
        {ARTE[a.tipo]}
      </div>
      <div className="cd-hero__txt" aria-live="polite">
        <small>
          Aviso · {TIPO[a.tipo]}
          {a.setor ? "" : " · todos"}
        </small>
        <h2>{a.titulo}</h2>
        {a.texto && <p>{a.texto}</p>}
        {a.link ? (
          <a className="cd-hero__mais" href={a.link} target="_blank" rel="noreferrer noopener">
            Saber mais ↗
          </a>
        ) : (
          <Link className="cd-hero__mais" to={`/app/d/${setor.id}/avisos`}>
            Ver avisos
          </Link>
        )}
      </div>
      {total > 1 && (
        <div className="cd-pontos">
          {avisos.map((x, n) => (
            <button key={x.id} type="button" aria-label={`Aviso ${n + 1} de ${total}`} aria-current={n === i % total} onClick={() => setI(n)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Início do departamento: ABRIR CHAMADO, avisos, quadrados e "em andamento". */
export function Inicio() {
  const setor = useDepartamento();
  const { entrada, como } = useCd();
  const meus = useQuery({ queryKey: ["cd", "meus", como, "abertos"], queryFn: () => calperdesk.meusChamados("abertos", como), refetchInterval: 60_000 });
  const avisos = useQuery({ queryKey: ["cd", "avisos", setor?.id], queryFn: () => calperdesk.avisos(setor!.id), enabled: Boolean(setor) });
  if (!setor) return <Navigate to="/app" replace />;
  const q = entrada.config.quadros;
  const wa = entrada.config.whatsapp;
  const noAr = (avisos.data ?? []).filter((a) => !a.fim || Date.parse(a.fim) > Date.now());

  return (
    <>
      <Cabecalho
        direita={
          <Link to="/app" className="cd-pilula cd-pilula--ouro" aria-label={`Departamento ${setor.nome}. Trocar`}>
            <span aria-hidden="true">{setor.icone}</span> {setor.nome} ▾
          </Link>
        }
      />
      <div className="cd-bv">
        <h1>Olá, {entrada.nome.split(" ")[0]}</h1>
        <p>
          {setor.nome} · {entrada.config.boasVindas}
        </p>
      </div>
      <Link to={`/app/d/${setor.id}/abrir`} className="cd-btn-abrir">
        <PlusCircle size={24} aria-hidden="true" />
        ABRIR CHAMADO
      </Link>
      {q.avisos !== false && <Carrossel avisos={noAr} setor={setor} />}
      <nav className="cd-grade" aria-label="Atalhos">
        {q.meus !== false && (
          <Link to="/app/chamados" className="cd-tile cd-tile--ouro">
            {(meus.data?.novos ?? 0) > 0 && <span className="cd-badge" aria-label={`${meus.data?.novos} com resposta nova`}>{meus.data?.novos}</span>}
            <ClipboardList size={30} strokeWidth={1.5} aria-hidden="true" />
            <span>Meus chamados</span>
            {meus.data && <small>{meus.data.abertos} {meus.data.abertos === 1 ? "aberto" : "abertos"}</small>}
          </Link>
        )}
        {q.avisos !== false && (
          <Link to={`/app/d/${setor.id}/avisos`} className="cd-tile">
            <Megaphone size={28} strokeWidth={1.6} aria-hidden="true" />
            <span>Avisos</span>
          </Link>
        )}
        {q.solucoes !== false && (
          <Link to={`/app/d/${setor.id}/solucoes`} className="cd-tile">
            <Lightbulb size={28} strokeWidth={1.6} aria-hidden="true" />
            <span>Soluções</span>
          </Link>
        )}
        {q.whatsapp !== false && wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer noopener" className="cd-tile cd-tile--wa">
            <MessageCircle size={28} strokeWidth={1.6} aria-hidden="true" />
            <span>Falar no WhatsApp</span>
          </a>
        )}
        {q.perfil !== false && (
          <Link to="/app/perfil" className="cd-tile">
            <User size={28} strokeWidth={1.6} aria-hidden="true" />
            <span>Meu perfil</span>
          </Link>
        )}
        {entrada.setores.length > 1 && (
          <Link to="/app" className="cd-tile">
            <ArrowLeftRight size={28} strokeWidth={1.6} aria-hidden="true" />
            <span>Trocar depto.</span>
          </Link>
        )}
      </nav>
      {meus.data && meus.data.itens.length > 0 && (
        <div className="cd-sec">
          <span className="cd-rot">Em andamento</span>
          <div style={{ display: "grid", gap: 10 }}>
            {meus.data.itens.slice(0, 3).map((c) => (
              <CartaoChamado key={c.id} c={c} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function Avisos() {
  const setor = useDepartamento();
  const avisos = useQuery({ queryKey: ["cd", "avisos", setor?.id], queryFn: () => calperdesk.avisos(setor!.id), enabled: Boolean(setor) });
  if (!setor) return <Navigate to="/app" replace />;
  return (
    <>
      <SubCabecalho titulo="Avisos" sub={`${setor.nome} e avisos gerais`} voltar={`/app/d/${setor.id}`} />
      {avisos.isPending ? (
        <Carregando />
      ) : (avisos.data ?? []).length === 0 ? (
        <p className="cd-vazio">Nenhum aviso no momento.</p>
      ) : (
        <div className="cd-lista">
          {avisos.data!.map((a) => (
            <article key={a.id} className="cd-card">
              <div className="cd-card__l1">
                <span>
                  {quando(a.inicio)}
                  {a.fim ? ` → ${DIA_HORA.format(new Date(a.fim))}` : ""}
                </span>
                <span className={`cd-st cd-st--${a.tipo === "resolvido" ? "resolvido" : a.tipo === "comunicado" ? "novo" : "andamento"}`}>{TIPO[a.tipo]}</span>
              </div>
              <h3>
                {ARTE[a.tipo]} {a.titulo}
              </h3>
              {a.texto && <p>{a.texto}</p>}
              {a.link && (
                <p style={{ marginTop: 6 }}>
                  <a href={a.link} target="_blank" rel="noreferrer noopener" style={{ color: "var(--cd-ouro)" }}>
                    Saber mais ↗
                  </a>
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function Solucoes() {
  const setor = useDepartamento();
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);
  const lista = useQuery({ queryKey: ["cd", "solucoes", setor?.id], queryFn: () => calperdesk.solucoes(setor!.id, null, null), enabled: Boolean(setor) });
  if (!setor) return <Navigate to="/app" replace />;
  const termo = busca.trim().toLowerCase();
  const itens = (lista.data ?? []).filter((s) => !termo || `${s.titulo} ${s.texto} ${s.servico ?? ""}`.toLowerCase().includes(termo));
  const abrir = (id: number) => {
    setAberta((x) => (x === id ? null : id));
    if (aberta !== id) void calperdesk.solucaoUsada(id).catch(() => {});
  };
  return (
    <>
      <SubCabecalho titulo="Soluções" sub="Resolva sozinho em segundos" voltar={`/app/d/${setor.id}`} />
      <div className="cd-sec">
        <input className="cd-campo" type="search" placeholder="Buscar: senha, vpn, impressora…" aria-label="Buscar solução" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {lista.isPending ? (
        <Carregando />
      ) : itens.length === 0 ? (
        <p className="cd-vazio">
          Nenhuma solução encontrada.
          <br />
          <Link to={`/app/d/${setor.id}/abrir`} style={{ color: "var(--cd-ouro)" }}>
            Abrir um chamado
          </Link>
        </p>
      ) : (
        <div className="cd-lista">
          {itens.map((s) => (
            <button key={s.id} type="button" className="cd-card" aria-expanded={aberta === s.id} onClick={() => abrir(s.id)}>
              <div className="cd-card__l1">
                <span>{s.servico ?? setor.nome}</span>
                {s.usos > 0 && <span>usada {s.usos}×</span>}
              </div>
              <h3>{s.titulo}</h3>
              <p>{aberta === s.id ? s.texto : s.texto.length > 90 ? `${s.texto.slice(0, 90)}…` : s.texto}</p>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function Perfil() {
  const { entrada, simulando } = useCd();
  const qc = useQueryClient();
  const [nome, setNome] = useState(entrada.nome);
  const [telefone, setTelefone] = useState(formatarTelefone(entrada.telefone));
  const [erro, setErro] = useState<{ campo?: string; texto: string } | null>(null);
  const salvar = useMutation({
    mutationFn: () => calperdesk.salvarPerfil({ nome: nome.trim(), telefone }),
    onSuccess: async () => {
      setErro(null);
      toast.success("Perfil salvo.");
      await qc.invalidateQueries({ queryKey: ["cd", "entrada"] });
    },
    onError: (e: Error & { field?: string }) => setErro({ campo: e.field, texto: e.message }),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };
  return (
    <>
      <SubCabecalho titulo="Meu perfil" sub="Para a equipe te encontrar rápido" voltar="/app" />
      <form className="cd-sec" onSubmit={enviar}>
        <div className="cd-ident" style={{ margin: 0 }}>
          <span className="cd-av" aria-hidden="true">
            {iniciais(entrada.nome)}
          </span>
          <div>
            <b>{entrada.nome}</b>
            <span>{entrada.email}</span>
          </div>
        </div>
        {erro && !erro.campo && <p className="cd-alerta" style={{ marginTop: 12 }}>{erro.texto}</p>}
        <label className="cd-rot" htmlFor="cd-nome">
          Nome completo
        </label>
        <input id="cd-nome" className="cd-campo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" aria-invalid={erro?.campo === "nome" || undefined} />
        {erro?.campo === "nome" && <span className="cd-erro">{erro.texto}</span>}
        <label className="cd-rot" htmlFor="cd-tel">
          Telefone corporativo (WhatsApp)
        </label>
        <input
          id="cd-tel"
          className="cd-campo"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(21) 99999-9999"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          aria-invalid={erro?.campo === "telefone" || undefined}
        />
        {erro?.campo === "telefone" ? (
          <span className="cd-erro">{erro.texto}</span>
        ) : (
          <span className="cd-erro" style={{ color: "var(--cd-txt-3)" }}>
            Com ele, a equipe já sabe quem é você quando você escreve no WhatsApp do suporte.
          </span>
        )}
        <div style={{ height: 16 }} />
        <button type="submit" className="cd-btn-ouro" disabled={simulando || salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </button>
        {entrada.equipe && !simulando && (
          <>
            <div style={{ height: 10 }} />
            <Link to="/home" className="cd-btn-vidro">
              Ir para o portal da equipe
            </Link>
          </>
        )}
      </form>
    </>
  );
}
