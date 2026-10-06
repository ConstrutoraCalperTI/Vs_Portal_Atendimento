import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CheckCircle2, CircleCheck, CircleX, Mail, MoreVertical, Plus, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useAccess } from "../../configuracoes/access/useAccess";
import { ConfirmDialog } from "../../configuracoes/components/ConfirmDialog";
import { EmptyState } from "../../configuracoes/components/EmptyState";
import { ErrorState } from "../../configuracoes/components/ErrorState";
import { ServiceError } from "../../configuracoes/services/types";
import { formatDateTime } from "../../../utils/dates";
import {
  useContasEmail,
  useContexto,
  useExcluirContaEmail,
  useHabilitarContasEmail,
  useSalvarContaEmail,
  useSenhaContaEmail,
  useTestarContaEmail,
} from "../hooks/useAtendimento";
import { contaNova, PROVEDORES, type ContaEmail, type ContaEmailDados, type ProvedorEmail, type VerificacaoEmail } from "../services/email";
import type { Setor } from "../services/tipos";
import { hora } from "./util";
import "./Atendimento.css";

const msgErro = (e: unknown, padrao: string) => (e instanceof ServiceError ? e.message : padrao);

type Status = "conectado" | "falha" | "aguardando" | "inativo";
const STATUS: Record<Status, { rotulo: string; classe: string }> = {
  conectado: { rotulo: "Conectado", classe: "em-st--ok" },
  falha: { rotulo: "Falha na conexão", classe: "em-st--falha" },
  aguardando: { rotulo: "Aguardando teste", classe: "em-st--aguardando" },
  inativo: { rotulo: "Inativo", classe: "em-st--inativo" },
};
const statusDe = (c: ContaEmail): Status => (c.habilitada ? c.status : "inativo");

/** Gestão de Atendimento › Contas de e-mail (estrutura da Movidesk). */
export function ContasEmail() {
  const contexto = useContexto();
  const contas = useContasEmail();
  const [editando, setEditando] = useState<ContaEmail | "nova" | null>(null);
  if (contexto.isPending || contas.isPending) return <PageSkeleton />;
  if (contexto.isError) return <ErrorState message="Não foi possível carregar os setores." onRetry={() => void contexto.refetch()} />;
  if (contas.isError) return <ErrorState message={msgErro(contas.error, "Não foi possível carregar as contas de e-mail.")} onRetry={() => void contas.refetch()} />;

  const supervisor = contexto.data.supervisor;
  if (editando !== null) {
    const atual = editando === "nova" ? null : (contas.data.find((c) => c.id === editando.id) ?? editando);
    return <FormConta key={atual?.id ?? "nova"} conta={atual} setores={contexto.data.setores} podeEditar={supervisor} onFechar={() => setEditando(null)} onNova={() => setEditando("nova")} onAbrir={(c) => setEditando(c)} />;
  }
  return <Lista contas={contas.data} supervisor={supervisor} semSetores={contexto.data.setores.length === 0} onAbrir={setEditando} />;
}

// ---------------------------------------------------------------- Lista

function Lista({ contas, supervisor, semSetores, onAbrir }: { contas: ContaEmail[]; supervisor: boolean; semSetores: boolean; onAbrir: (c: ContaEmail | "nova") => void }) {
  const ids = useId();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const habilitar = useHabilitarContasEmail();
  const testar = useTestarContaEmail();
  const [testandoTodas, setTestandoTodas] = useState(false);

  const q = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () =>
      contas
        .filter((c) => q.length < 3 || `${c.nome} ${c.email} ${c.setorNome}`.toLowerCase().includes(q))
        .filter((c) => !status || statusDe(c) === status)
        .sort((a, b) => a.email.localeCompare(b.email)),
    [contas, q, status],
  );
  const naFila = contas.reduce((s, c) => s + c.naFila, 0);
  const todasMarcadas = visiveis.length > 0 && visiveis.every((c) => marcadas.has(c.id));

  const marcar = (id: number) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const lote = (habilitada: boolean) => {
    if (marcadas.size === 0) return void toast.info("Marque as contas na lista primeiro.");
    habilitar.mutate({ ids: [...marcadas], habilitada }, { onSuccess: (n) => { toast.success(`${n} conta(s) ${habilitada ? "habilitada(s)" : "desabilitada(s)"}`); setMarcadas(new Set()); }, onError: (e) => toast.error(msgErro(e, "Não foi possível alterar.")) });
  };
  const testarTodas = async () => {
    setTestandoTodas(true);
    let ok = 0;
    const alvo = contas.filter((c) => c.habilitada);
    for (const c of alvo) {
      try {
        if ((await testar.mutateAsync({ id: c.id })).ok) ok++;
      } catch {
        /* a conta fica com a falha registrada */
      }
    }
    setTestandoTodas(false);
    toast.info(`${ok} de ${alvo.length} conta(s) conectada(s)`);
  };
  const exportar = () => {
    const linhas = [["Nome", "Endereço", "Setor", "Provedor", "Status", "E-mails na fila", "Habilitado"], ...visiveis.map((c) => [c.nome, c.email, c.setorNome, PROVEDORES.find((p) => p.id === c.provedor)?.rotulo ?? c.provedor, STATUS[statusDe(c)].rotulo, String(c.naFila), c.habilitada ? "Sim" : "Não"])];
    const csv = "﻿" + linhas.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "contas-de-email.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="card" aria-labelledby={`${ids}-t`}>
      <div className="em-head">
        <div className="em-head__tit">
          <h2 id={`${ids}-t`}>Contas de e-mail</h2>
          <small>Exibindo {visiveis.length} de um total de {contas.length} registro(s)</small>
        </div>
        {supervisor && (
          <button type="button" className="btn btn--primary" disabled={semSetores} title={semSetores ? "Cadastre um setor antes" : undefined} onClick={() => onAbrir("nova")}>
            <Plus size={16} aria-hidden="true" />
            Nova conta
          </button>
        )}
        {supervisor && (
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="btn btn--outline" disabled={testandoTodas}>
                {testandoTodas ? "Testando…" : "Opções"}
                <MoreVertical size={15} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="menu">
                <DropdownMenu.Item className="menu__item" onSelect={() => void testarTodas()}><RefreshCw size={15} aria-hidden="true" />Testar todas as contas</DropdownMenu.Item>
                <DropdownMenu.Item className="menu__item" onSelect={() => lote(true)}><CircleCheck size={15} aria-hidden="true" />Habilitar marcadas</DropdownMenu.Item>
                <DropdownMenu.Item className="menu__item menu__item--warning" onSelect={() => lote(false)}><CircleX size={15} aria-hidden="true" />Desabilitar marcadas</DropdownMenu.Item>
                <DropdownMenu.Separator className="menu__separator" />
                <DropdownMenu.Item className="menu__item" onSelect={exportar}>Exportar lista (Excel)</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
        <div className="em-busca">
          <label className="visually-hidden" htmlFor={`${ids}-busca`}>Pesquisar</label>
          <input id={`${ids}-busca`} className="input" type="search" placeholder="Pesquisar nome, endereço ou setor" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <small>Digite pelo menos 3 caracteres para iniciar a busca.</small>
        </div>
        <div>
          <label className="visually-hidden" htmlFor={`${ids}-st`}>Status</label>
          <select id={`${ids}-st`} className="input" value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
            <option value="">Todos os status</option>
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS[s].rotulo}</option>
            ))}
          </select>
        </div>
      </div>

      {contas.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nenhuma conta de e-mail"
          description={semSetores ? "Cadastre um setor em Setores e números: cada conta entrega os chamados na fila de um setor." : supervisor ? "Cadastre a primeira conta em Nova conta." : "A supervisão geral ainda não cadastrou contas para os seus setores."}
        />
      ) : (
        <div className="at-tab-wrap">
          <table className="at-tab em-tab">
            <thead>
              <tr>
                <th className="c">
                  {supervisor && (
                    <input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas} onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(visiveis.map((c) => c.id)))} />
                  )}
                </th>
                <th>Nome</th>
                <th>Endereço ↑</th>
                <th>Setor</th>
                <th>Provedor</th>
                <th>Status de conexão</th>
                <th className="n">E-mails na fila</th>
                <th>Última leitura</th>
                <th className="c">Habilitado</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => {
                const st = statusDe(c);
                return (
                  <tr key={c.id} className={c.habilitada ? undefined : "em-inativa"} tabIndex={0} onClick={() => onAbrir(c)} onKeyDown={(e) => e.key === "Enter" && onAbrir(c)}>
                    <td className="c" onClick={(e) => e.stopPropagation()}>
                      {supervisor && <input type="checkbox" aria-label={`Marcar ${c.email}`} checked={marcadas.has(c.id)} onChange={() => marcar(c.id)} />}
                    </td>
                    <td>{c.nome}</td>
                    <td>{c.email}</td>
                    <td><span className="at-tag">{c.setorNome}</span></td>
                    <td>{c.modo === "api_google" ? "Google (API)" : (PROVEDORES.find((p) => p.id === c.provedor)?.rotulo ?? c.provedor)}</td>
                    <td><span className={`em-st ${STATUS[st].classe}`} title={c.ultimoErro ?? undefined}>{STATUS[st].rotulo}</span></td>
                    <td className="n">{c.naFila}</td>
                    <td>{c.ultimaLeituraEm ? hora(c.ultimaLeituraEm) : "—"}</td>
                    <td className="c">
                      {c.habilitada ? <CheckCircle2 size={20} className="em-hab em-hab--sim" aria-label="Sim" /> : <XCircle size={20} className="em-hab em-hab--nao" aria-label="Não" />}
                    </td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr><td colSpan={9} className="at-vazio">Nenhuma conta com esse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="em-rodape">
        {contas.filter((c) => c.habilitada && c.status === "conectado").length} conectada(s) · {contas.filter((c) => c.habilitada && c.status === "falha").length} com falha · {naFila} e-mail(s) na fila
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Formulário (3 abas)

type Aba = "principal" | "receb" | "envio";

function FormConta({
  conta,
  setores,
  podeEditar,
  onFechar,
  onNova,
  onAbrir,
}: {
  conta: ContaEmail | null;
  setores: Setor[];
  podeEditar: boolean;
  onFechar: () => void;
  onNova: () => void;
  onAbrir: (c: ContaEmail) => void;
}) {
  const ids = useId();
  const { user } = useAccess();
  const salvar = useSalvarContaEmail();
  const salvarSenha = useSenhaContaEmail();
  const testar = useTestarContaEmail();
  const excluir = useExcluirContaEmail();
  const [aba, setAba] = useState<Aba>("principal");
  const [d, setD] = useState<ContaEmailDados>(() => (conta ? { ...conta } : contaNova(setores[0]?.id ?? null)));
  const [senha, setSenha] = useState("");
  const [ignorar, setIgnorar] = useState((conta?.ignorarRemetentes ?? contaNova(null).ignorarRemetentes).join("\n"));
  const [erro, setErro] = useState<{ campo?: string; mensagem: string } | null>(null);
  const [enviarPara, setEnviarPara] = useState(user?.email ?? "");
  const [resultado, setResultado] = useState<VerificacaoEmail | null>(conta?.verificacao ?? null);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const somenteLeitura = !podeEditar;
  const ocupado = salvar.isPending || salvarSenha.isPending || testar.isPending;

  useEffect(() => setResultado(conta?.verificacao ?? null), [conta?.verificacao]);

  const muda = <K extends keyof ContaEmailDados>(k: K, v: ContaEmailDados[K]) => setD((x) => ({ ...x, [k]: v }));
  const provedor = PROVEDORES.find((p) => p.id === d.provedor)!;
  const google = d.provedor === "google";
  const api = google && d.modo === "api_google";
  const trocarProvedor = (p: ProvedorEmail) => {
    const pr = PROVEDORES.find((x) => x.id === p)!;
    setD((x) => ({ ...x, provedor: p, modo: p === "google" ? x.modo : "imap_smtp", imapHost: pr.imap, smtpHost: pr.smtp, imapPorta: 993, smtpPorta: 465, imapSeguranca: "ssl" }));
  };
  const erroDe = (campo: string) => (erro?.campo === campo ? <span className="field__error" role="alert">{erro.mensagem}</span> : null);

  /** Salva e devolve o id (ou null se deu erro). A senha, se digitada, vai depois, direto para o cofre. */
  const gravar = async (): Promise<number | null> => {
    setErro(null);
    try {
      const id = await salvar.mutateAsync({
        ...d,
        id: conta?.id,
        usuario: d.usuario || d.email,
        ignorarRemetentes: ignorar.split(/\n|,|;/).map((x) => x.trim()).filter(Boolean),
      });
      if (senha && !api) await salvarSenha.mutateAsync({ id, senha });
      setSenha("");
      return id;
    } catch (e) {
      if (e instanceof ServiceError) {
        setErro({ campo: e.field, mensagem: e.message });
        if (e.field && ["imapHost", "smtpPorta", "modo"].includes(e.field)) setAba(e.field === "smtpPorta" ? "envio" : "receb");
        else if (e.field) setAba("principal");
      } else toast.error("Não foi possível salvar a conta.");
      return null;
    }
  };

  const salvarEFechar = async () => {
    if (await gravar()) {
      toast.success("Conta salva");
      onFechar();
    }
  };
  const salvarENova = async () => {
    if (await gravar()) {
      toast.success("Conta salva");
      onNova();
    }
  };
  const testarAgora = async () => {
    const id = await gravar();
    if (!id) return;
    try {
      const r = await testar.mutateAsync({ id, enviarPara: enviarPara.trim() || undefined });
      setResultado(r);
      if (r.ok) toast.success("Conta conectada");
      else toast.error("O teste encontrou um problema: veja os passos.");
      if (!conta) onAbrir({ ...(d as ContaEmail), id });
    } catch (e) {
      toast.error(msgErro(e, "Não foi possível testar."));
    }
  };

  return (
    <section className="card em-form" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className="visually-hidden">{conta ? conta.nome : "Nova conta de e-mail"}</h2>
      <div className="em-abas" role="tablist" aria-label="Seções da conta">
        {([["principal", "Principal"], ["receb", "Configurações de recebimento"], ["envio", "Configurações de envio"]] as const).map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={`em-aba${aba === id ? " em-aba--on" : ""}`} onClick={() => setAba(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      <fieldset className="em-corpo" disabled={somenteLeitura}>
        {somenteLeitura && <p className="at-sec__ajuda">Só leitura: a supervisão geral cadastra e altera as contas de e-mail.</p>}

        {aba === "principal" && (
          <div className="em-pane">
            <div className="em-l2">
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-nome`}>Nome da conta</label>
                <input id={`${ids}-nome`} className="input" maxLength={80} value={d.nome} onChange={(e) => muda("nome", e.target.value)} placeholder="Ex.: CFTV" />
                {erroDe("nome")}
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-email`}>Endereço de e-mail</label>
                <input id={`${ids}-email`} className="input" type="email" value={d.email} onChange={(e) => muda("email", e.target.value)} placeholder="cftv@calper.com.br" />
                {erroDe("email")}
              </div>
            </div>
            <div className="em-l2">
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-setor`}>Setor (fila que recebe os chamados)</label>
                <select id={`${ids}-setor`} className="input" value={d.setorId ?? ""} onChange={(e) => muda("setorId", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Escolha…</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
                {erroDe("setorId")}
                <span className="field__help">Faz o papel da "Marca" da Movidesk: define a fila, a equipe e o horário dos chamados desta conta.</span>
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-rem`}>Nome de exibição do remetente</label>
                <input id={`${ids}-rem`} className="input" maxLength={80} value={d.nomeRemetente} onChange={(e) => muda("nomeRemetente", e.target.value)} placeholder="Calper · CFTV" />
                <span className="field__help">Como o cliente vê quem respondeu: "{d.nomeRemetente || "Calper"} &lt;{d.email || "conta@calper.com.br"}&gt;".</span>
              </div>
            </div>
            <hr className="em-sep" />
            <Chk id={`${ids}-c1`} rotulo="Exibir esta conta no envio de e-mails do chamado" ajuda="Desmarcado, a conta não aparece como possível remetente ao responder um chamado." checked={d.exibirNoEnvio} onChange={(v) => muda("exibirNoEnvio", v)} />
            <Chk id={`${ids}-c2`} rotulo="Conta padrão de envio do setor" ajuda="Usada quando o atendente abre um chamado novo para o cliente (e não responde a um e-mail recebido). Só uma por setor." checked={d.padraoDoSetor} onChange={(v) => muda("padraoDoSetor", v)} />
            <Chk id={`${ids}-c3`} rotulo="Utilizar logomarca da conta de e-mail" ajuda="Marcado, o e-mail sai com a logomarca da conta no lugar da foto do atendente. O envio da imagem entra junto com o envio dos e-mails." checked={d.usarLogo} onChange={(v) => muda("usarLogo", v)} />
            <hr className="em-sep" />
            <div className="field">
              <span className="field__label" id={`${ids}-prov`}>Selecione o provedor de e-mail para auxiliar na configuração da conta</span>
              <div className="em-radios" role="radiogroup" aria-labelledby={`${ids}-prov`}>
                {PROVEDORES.map((p) => (
                  <label key={p.id}>
                    <input type="radio" name={`${ids}-prov`} checked={d.provedor === p.id} onChange={() => trocarProvedor(p.id)} />
                    {p.rotulo}
                  </label>
                ))}
              </div>
              <span className="field__help">O domínio @calper.com.br está no Google Workspace: para essas contas, use "Google Workspace / Gmail".</span>
              {provedor.aviso && <p className="em-aviso" role="note">{provedor.aviso}</p>}
            </div>
            <Chk id={`${ids}-c4`} rotulo="Conta habilitada" ajuda="Desabilitada: não lê nem envia e-mails, mas mantém o histórico." checked={d.habilitada} onChange={(v) => muda("habilitada", v)} />
          </div>
        )}

        {aba === "receb" && (
          <div className="em-pane">
            {google && (
              <div className="field">
                <span className="field__label">Como o sistema acessa a caixa</span>
                <div className="em-modo" role="radiogroup" aria-label="Modo de acesso">
                  <button type="button" role="radio" aria-checked={d.modo === "api_google"} className={d.modo === "api_google" ? "em-modo--on" : undefined} onClick={() => muda("modo", "api_google")}>
                    <b>Conexão Google (recomendado)</b>
                    <span>Sem senha: a TI autoriza o portal uma vez no Google Workspace e ele lê e envia por API.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={d.modo === "imap_smtp"} className={d.modo === "imap_smtp" ? "em-modo--on" : undefined} onClick={() => muda("modo", "imap_smtp")}>
                    <b>IMAP/SMTP com senha de app</b>
                    <span>Exige verificação em 2 etapas na conta e uma senha de app de 16 letras.</span>
                  </button>
                </div>
                {erroDe("modo")}
              </div>
            )}
            {api ? (
              <p className="em-info">A conta usa a chave da conta de serviço salva em <b>Configurações › Integrações › Google Workspace</b>. Não há servidor nem senha para preencher aqui.</p>
            ) : (
              <>
                <div className="em-l3">
                  <div className="field">
                    <label className="field__label" htmlFor={`${ids}-ih`}>Servidor de entrada (IMAP)</label>
                    <input id={`${ids}-ih`} className="input" value={d.imapHost} onChange={(e) => muda("imapHost", e.target.value)} placeholder="imap.provedor.com.br" />
                    {erroDe("imapHost")}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${ids}-ip`}>Porta</label>
                    <input id={`${ids}-ip`} className="input" type="number" value={d.imapPorta} onChange={(e) => muda("imapPorta", Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${ids}-is`}>Segurança</label>
                    <select id={`${ids}-is`} className="input" value={d.imapSeguranca} onChange={(e) => muda("imapSeguranca", e.target.value as "ssl" | "starttls")}>
                      <option value="ssl">SSL/TLS</option>
                      <option value="starttls">STARTTLS</option>
                    </select>
                  </div>
                </div>
                <div className="em-l2">
                  <div className="field">
                    <label className="field__label" htmlFor={`${ids}-us`}>Usuário</label>
                    <input id={`${ids}-us`} className="input" value={d.usuario} onChange={(e) => muda("usuario", e.target.value)} placeholder={d.email || "o próprio endereço"} />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${ids}-se`}>Senha (ou senha de app)</label>
                    <input id={`${ids}-se`} className="input" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={conta?.senhaMascara ? `Guardada (${conta.senhaMascara}). Digite para trocar.` : "Digite a senha"} />
                    {erroDe("senha")}
                    <span className="field__help">Fica no cofre do Supabase e nunca volta para o navegador.</span>
                  </div>
                </div>
              </>
            )}
            <hr className="em-sep" />
            <div className="em-l3">
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-pa`}>Pasta a ler</label>
                <input id={`${ids}-pa`} className="input" value={d.pasta} onChange={(e) => muda("pasta", e.target.value)} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-in`}>Ler a cada</label>
                <select id={`${ids}-in`} className="input" value={d.intervaloMin} onChange={(e) => muda("intervaloMin", Number(e.target.value))}>
                  {[1, 2, 5, 10, 15].map((m) => (
                    <option key={m} value={m}>{m} minuto{m > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-ld`}>Ler a partir de</label>
                <input id={`${ids}-ld`} className="input" type="date" value={d.lerDesde} onChange={(e) => muda("lerDesde", e.target.value)} />
              </div>
            </div>
            <Chk id={`${ids}-r1`} rotulo="Marcar como lido na caixa depois de importar" checked={d.marcarLido} onChange={(v) => muda("marcarLido", v)} />
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-mv`}>Mover para a pasta depois de importar (opcional)</label>
              <input id={`${ids}-mv`} className="input" value={d.moverPara} onChange={(e) => muda("moverPara", e.target.value)} placeholder="ex.: Importados pelo portal" />
            </div>
            <Chk id={`${ids}-r2`} rotulo="Juntar respostas ao mesmo chamado" ajuda='Pelo número no assunto ("[#10241] …") e pelo histórico do e-mail: a resposta do cliente entra no chamado em vez de abrir outro.' checked={d.juntarRespostas} onChange={(v) => muda("juntarRespostas", v)} />
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-ig`}>Ignorar e-mails destes remetentes ou domínios (um por linha)</label>
              <textarea id={`${ids}-ig`} className="input" rows={4} value={ignorar} onChange={(e) => setIgnorar(e.target.value)} />
              <span className="field__help">Evita chamado de resposta automática, aviso de entrega e marketing. Vale o começo do endereço (noreply@) ou o domínio (@rdstation.com.br).</span>
            </div>
          </div>
        )}

        {aba === "envio" && (
          <div className="em-pane">
            {api ? (
              <p className="em-info">Com a <b>Conexão Google</b>, o envio sai pela própria conta e fica em "Enviados" do Gmail. Não há servidor nem senha para configurar.</p>
            ) : (
              <>
                <div className="em-l3">
                  <div className="field">
                    <label className="field__label" htmlFor={`${ids}-sh`}>Servidor de saída (SMTP)</label>
                    <input id={`${ids}-sh`} className="input" value={d.smtpHost} onChange={(e) => muda("smtpHost", e.target.value)} placeholder="smtp.provedor.com.br" />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${ids}-sp`}>Porta</label>
                    <input id={`${ids}-sp`} className="input" type="number" value={d.smtpPorta} onChange={(e) => muda("smtpPorta", Number(e.target.value))} />
                    {erroDe("smtpPorta")}
                  </div>
                  <div className="field">
                    <span className="field__label">Segurança</span>
                    <input className="input" value="SSL/TLS" readOnly aria-label="Segurança do SMTP" />
                  </div>
                </div>
                <span className="field__help">Só a porta 465 (SSL): o servidor do portal (Supabase) bloqueia as portas 25 e 587.</span>
                <span className="field__help">O envio usa o mesmo usuário e senha do recebimento.</span>
              </>
            )}
            <hr className="em-sep" />
            <div className="em-l2">
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-rp`}>Responder para (opcional)</label>
                <input id={`${ids}-rp`} className="input" type="email" value={d.responderPara} onChange={(e) => muda("responderPara", e.target.value)} placeholder="igual ao endereço da conta" />
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-co`}>Cópia oculta de todas as respostas (opcional)</label>
                <input id={`${ids}-co`} className="input" type="email" value={d.copiaOculta} onChange={(e) => muda("copiaOculta", e.target.value)} placeholder="ex.: arquivo@calper.com.br" />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-as`}>Assinatura das respostas</label>
              <textarea id={`${ids}-as`} className="input" rows={5} maxLength={4000} value={d.assinatura} onChange={(e) => muda("assinatura", e.target.value)} placeholder={"--\n{atendente}\nCalper · CFTV"} />
              <span className="field__help">{"{atendente}"} vira o nome de quem respondeu. O número do chamado entra no assunto: "[#10241] …".</span>
            </div>
          </div>
        )}

        {erro && !erro.campo && <p className="field__error" role="alert">{erro.mensagem}</p>}

        {!somenteLeitura && (
          <div className="em-teste">
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-tp`}>Enviar e-mail de teste para (opcional, ao testar)</label>
              <input id={`${ids}-tp`} className="input" type="email" value={enviarPara} onChange={(e) => setEnviarPara(e.target.value)} />
            </div>
          </div>
        )}
        {resultado && (
          <div className="em-resultado" aria-live="polite">
            <b>Resultado do teste · {formatDateTime(resultado.em)}</b>
            {resultado.passos.map((p, i) => (
              <div key={i} className="em-passo">
                <i className={p.ok ? "em-passo--ok" : "em-passo--er"} aria-hidden="true">{p.ok ? "✓" : "!"}</i>
                <span>{p.passo}</span>
                <small>{p.detalhe}</small>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <div className="em-acoes">
        {podeEditar && conta && (
          <button type="button" className="btn btn--danger" disabled={ocupado || excluir.isPending} onClick={() => setConfirmarExcluir(true)}>Excluir</button>
        )}
        <button type="button" className="btn btn--outline" onClick={onFechar}>{podeEditar ? "Cancelar" : "Voltar"}</button>
        {podeEditar && (
          <div className="em-acoes__dir">
            <button type="button" className="btn btn--outline" disabled={ocupado} onClick={() => void testarAgora()}>{testar.isPending ? "Testando…" : "Testar configurações"}</button>
            <button type="button" className="btn btn--outline" disabled={ocupado} onClick={() => void salvarENova()}>Salvar e criar um novo</button>
            <button type="button" className="btn btn--primary" disabled={ocupado} onClick={() => void salvarEFechar()}>{salvar.isPending ? "Salvando…" : "Salvar"}</button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmarExcluir}
        onOpenChange={setConfirmarExcluir}
        title="Excluir a conta?"
        description={`${conta?.email ?? ""} deixa de existir no portal e a senha guardada é apagada. Se a conta já recebeu e-mails, desabilite em vez de excluir.`}
        confirmLabel="Excluir"
        tone="danger"
        isPending={excluir.isPending}
        onConfirm={() =>
          conta &&
          excluir.mutate(conta.id, {
            onSuccess: () => { toast.success("Conta excluída"); setConfirmarExcluir(false); onFechar(); },
            onError: (e) => { toast.error(msgErro(e, "Não foi possível excluir.")); setConfirmarExcluir(false); },
          })
        }
      />
    </section>
  );
}

function Chk({ id, rotulo, ajuda, checked, onChange }: { id: string; rotulo: string; ajuda?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="em-chk">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div>
        <label htmlFor={id}>{rotulo}</label>
        {ajuda && <span className="field__help">{ajuda}</span>}
      </div>
    </div>
  );
}
