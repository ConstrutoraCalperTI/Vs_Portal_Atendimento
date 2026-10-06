import { CheckCircle2, CircleAlert, Copy, KeyRound, RefreshCw, Upload } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { formatDateTime } from "../../../utils/dates";
import { useAccess } from "../../configuracoes/access/useAccess";
import { ErrorState } from "../../configuracoes/components/ErrorState";
import { ServiceError } from "../../configuracoes/services/types";
import { useGoogleWorkspace, useSalvarChaveGoogle, useTestarGoogle } from "../hooks/useAtendimento";
import "./Atendimento.css";

const ESCOPOS = "https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.send";
const msgErro = (e: unknown, padrao: string) => (e instanceof ServiceError ? e.message : padrao);

/** Configurações › Integrações › Google Workspace (super admin): chave da conta de serviço das Contas de e-mail. */
export function IntegracaoGoogle() {
  const ids = useId();
  const g = useGoogleWorkspace();
  const salvar = useSalvarChaveGoogle();
  const testar = useTestarGoogle();
  const { user } = useAccess();
  const [json, setJson] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [caixa, setCaixa] = useState(user?.email ?? "");

  if (g.isPending) return <PageSkeleton />;
  if (g.isError) return <ErrorState message={msgErro(g.error, "Não foi possível carregar a conexão do Google.")} onRetry={() => void g.refetch()} />;

  let clientId: string | null = null;
  try {
    clientId = json ? ((JSON.parse(json) as { client_id?: string }).client_id ?? null) : null;
  } catch {
    clientId = null;
  }
  const v = g.data.verificacao;
  const copiar = (t: string) => void navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));

  return (
    <div className="at-grade2">
      <section className="card at-sec" aria-labelledby={`${ids}-t`}>
        <h2 id={`${ids}-t`}>Google Workspace (Contas de e-mail)</h2>
        <p>Com uma conta de serviço autorizada no domínio, o portal lê e envia pelas caixas @calper.com.br sem guardar a senha de cada conta. A chave fica no cofre do Supabase.</p>
        <div className="zv-passo">
          <span className={`zv-passo__ic zv-passo__ic--${g.data.contaServico ? (v ? (v.ok ? "ok" : "pend") : "neutro") : "pend"}`} aria-hidden="true">
            {g.data.contaServico && v?.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          </span>
          <div className="zv-passo__txt">
            <b>Chave da conta de serviço</b>
            <span>{g.data.contaServico ? <>Guardada: {g.data.contaServico}{g.data.definidoEm ? ` · ${formatDateTime(g.data.definidoEm)}` : ""}.</> : "Ainda não enviada."}</span>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-arq`}>Arquivo JSON da chave (Google Cloud › IAM › Contas de serviço › Chaves)</label>
          <input
            id={`${ids}-arq`}
            className="input"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(setJson);
            }}
          />
          {clientId && <span className="field__help">Client ID desta chave: <b className="mono">{clientId}</b> (é o que a TI informa na delegação, passo 2 ao lado).</span>}
          {erro && <span className="field__error" role="alert">{erro}</span>}
        </div>
        <div className="at-rodape">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!json || salvar.isPending}
            onClick={() => {
              setErro(null);
              salvar.mutate(json, {
                onSuccess: () => {
                  setJson("");
                  toast.success("Chave salva no cofre");
                },
                onError: (e) => setErro(msgErro(e, "Não foi possível salvar a chave.")),
              });
            }}
          >
            <Upload size={15} aria-hidden="true" />
            {salvar.isPending ? "Salvando…" : g.data.contaServico ? "Trocar chave" : "Salvar chave"}
          </button>
        </div>

        <h2 style={{ marginTop: 6 }}>Testar uma caixa</h2>
        <div className="zv-inline">
          <label className="visually-hidden" htmlFor={`${ids}-cx`}>Caixa para testar</label>
          <input id={`${ids}-cx`} className="input" type="email" value={caixa} onChange={(e) => setCaixa(e.target.value)} placeholder="cftv@calper.com.br" />
          <button
            type="button"
            className="btn btn--outline"
            disabled={!g.data.contaServico || !caixa.trim() || testar.isPending}
            onClick={() => testar.mutate(caixa.trim(), { onSuccess: (r) => (r.ok ? toast.success("O portal abriu a caixa") : toast.error("A caixa não abriu: veja o passo com erro")), onError: (e) => toast.error(msgErro(e, "Falha ao testar.")) })}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {testar.isPending ? "Testando…" : "Testar"}
          </button>
        </div>
        {v && (
          <div className="em-resultado">
            <b>{v.caixa} · {formatDateTime(v.em)}</b>
            {v.passos.map((p, i) => (
              <div key={i} className="em-passo">
                <i className={p.ok ? "em-passo--ok" : "em-passo--er"} aria-hidden="true">{p.ok ? "✓" : "!"}</i>
                <span>{p.passo}</span>
                <small>{p.detalhe}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card at-sec" aria-labelledby={`${ids}-ti`}>
        <h2 id={`${ids}-ti`}>Passo a passo para a TI (uma vez)</h2>
        <ol className="em-passos-ti">
          <li><b>Google Cloud Console</b> › crie (ou escolha) um projeto › APIs e serviços › ative a <b>Gmail API</b>.</li>
          <li>IAM e administrador › <b>Contas de serviço</b> › crie "portal-atendimento" › aba Chaves › Adicionar chave › <b>JSON</b>. Envie esse arquivo aqui ao lado.</li>
          <li>
            <b>Admin do Google Workspace</b> (admin.google.com) › Segurança › Acesso e controle de dados › Controles de API › <b>Delegação em todo o domínio</b> › Adicionar novo: informe o <b>Client ID</b> da conta de serviço e os escopos:
            <span className="em-copiar">
              <code>{ESCOPOS}</code>
              <button type="button" className="icon-btn" aria-label="Copiar escopos" onClick={() => copiar(ESCOPOS)}><Copy size={14} aria-hidden="true" /></button>
            </span>
          </li>
          <li>Volte aqui e use <b>Testar uma caixa</b> com uma conta real (a autorização pode levar alguns minutos para valer).</li>
        </ol>
        <p className="at-sec__ajuda"><KeyRound size={13} aria-hidden="true" /> A chave dá acesso às caixas do domínio nos escopos acima: guarde o arquivo original em local seguro e apague cópias depois de enviar.</p>
      </section>
    </div>
  );
}
