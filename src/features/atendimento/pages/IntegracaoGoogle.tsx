import { CheckCircle2, CircleAlert, Copy, KeyRound, RefreshCw, Upload } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { formatDateTime } from "../../../utils/dates";
import { useAccess } from "../../configuracoes/access/useAccess";
import { ErrorState } from "../../configuracoes/components/ErrorState";
import { ServiceError } from "../../configuracoes/services/types";
import { edgeFunction } from "../../../config/app";
import { useGoogleWorkspace, useSalvarChaveGoogle, useSalvarEscoposGoogle, useSalvarOAuthGoogle, useTestarGoogle } from "../hooks/useAtendimento";
import { ESCOPOS_GOOGLE } from "../services/email";
import "./Atendimento.css";

const msgErro = (e: unknown, padrao: string) => (e instanceof ServiceError ? e.message : padrao);
const igual = (a: readonly string[], b: readonly string[]) => [...a].sort().join(",") === [...b].sort().join(",");

/**
 * Configurações › Integrações › Google Workspace (super admin).
 * 1) Aplicativo OAuth do "Autorizar com Gmail" (recomendado, como a Movidesk): cada conta é autorizada por quem
 *    tem a senha da caixa, na própria tela da conta.
 * 2) Alternativa: Delegação em todo o domínio (conta de serviço + Clientes da API no Admin).
 */
export function IntegracaoGoogle() {
  return (
    <>
      <OAuthGoogle />
      <details className="em-alt">
        <summary>Alternativa: delegação em todo o domínio (conta de serviço, sem autorizar caixa por caixa)</summary>
        <DelegacaoGoogle />
      </details>
    </>
  );
}

function OAuthGoogle() {
  const ids = useId();
  const g = useGoogleWorkspace();
  const salvar = useSalvarOAuthGoogle();
  const [clientId, setClientId] = useState("");
  const [segredo, setSegredo] = useState("");
  const [erro, setErro] = useState<{ campo?: string; mensagem: string } | null>(null);
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const redirect = `${base || "https://<projeto>.supabase.co"}/functions/v1/${edgeFunction("google-oauth")}`;
  const copiar = (t: string) => void navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));
  if (g.isPending) return <PageSkeleton />;
  if (g.isError) return <ErrorState message={msgErro(g.error, "Não foi possível carregar a conexão do Google.")} onRetry={() => void g.refetch()} />;
  const configurado = !!g.data.oauthClientId;

  return (
    <div className="at-grade2">
      <section className="card at-sec" aria-labelledby={`${ids}-t`}>
        <h2 id={`${ids}-t`}>Autorizar com Gmail (OAuth)</h2>
        <p>Com o aplicativo OAuth do portal configurado, cada conta de e-mail ganha o botão <b>Autorizar com Gmail</b>: quem tem a senha da caixa entra no Google e autoriza, como na Movidesk. O token de cada caixa fica no cofre do Supabase.</p>
        <div className="zv-passo">
          <span className={`zv-passo__ic zv-passo__ic--${configurado ? "ok" : "pend"}`} aria-hidden="true">{configurado ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}</span>
          <div className="zv-passo__txt">
            <b>Aplicativo OAuth do portal</b>
            <span>{configurado ? <>ID do cliente: {g.data.oauthClientId}{g.data.oauthDefinidoEm ? ` · ${formatDateTime(g.data.oauthDefinidoEm)}` : ""}. A chave secreta fica no cofre.</> : "Ainda não configurado."}</span>
          </div>
        </div>
        <form
          className="em-pane"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            salvar.mutate(
              { clientId: clientId || g.data.oauthClientId || "", clientSecret: segredo },
              {
                onSuccess: () => {
                  setSegredo("");
                  setClientId("");
                  toast.success("Aplicativo OAuth salvo");
                },
                onError: (er) => setErro(er instanceof ServiceError ? { campo: er.field, mensagem: er.message } : { mensagem: "Não foi possível salvar." }),
              },
            );
          }}
        >
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-cid`}>ID do cliente</label>
            <input id={`${ids}-cid`} className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={g.data.oauthClientId ?? "000000000000-xxxxxxxx.apps.googleusercontent.com"} />
            {erro?.campo === "clientId" && <span className="field__error" role="alert">{erro.mensagem}</span>}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-sec`}>Chave secreta do cliente</label>
            <input id={`${ids}-sec`} className="input" type="password" autoComplete="off" value={segredo} onChange={(e) => setSegredo(e.target.value)} placeholder={configurado ? "Guardada no cofre. Digite para trocar." : "GOCSPX-…"} />
            {erro?.campo === "clientSecret" && <span className="field__error" role="alert">{erro.mensagem}</span>}
          </div>
          {erro && !erro.campo && <p className="field__error" role="alert">{erro.mensagem}</p>}
          <div className="at-rodape">
            <button type="submit" className="btn btn--primary" disabled={salvar.isPending || (!clientId && !segredo)}>
              <KeyRound size={15} aria-hidden="true" />
              {salvar.isPending ? "Salvando…" : configurado ? "Salvar alterações" : "Salvar aplicativo"}
            </button>
          </div>
        </form>
      </section>

      <section className="card at-sec" aria-labelledby={`${ids}-ti`}>
        <h2 id={`${ids}-ti`}>Passo a passo para a TI (uma vez)</h2>
        <ol className="em-passos-ti">
          <li><b>Google Cloud Console</b> (projeto da Calper) › APIs e serviços › ative a <b>Gmail API</b>.</li>
          <li>APIs e serviços › <b>Tela de consentimento OAuth</b> › Tipo de usuário <b>Interno</b> (só contas da Calper autorizam; não precisa de revisão do Google). Nome do app: "Portal Atendimento".</li>
          <li>
            APIs e serviços › Credenciais › <b>Criar credenciais › ID do cliente OAuth</b> › Tipo <b>Aplicativo da Web</b>. Em <b>URIs de redirecionamento autorizados</b>, cole:
            <span className="em-copiar">
              <code>{redirect}</code>
              <button type="button" className="icon-btn" aria-label="Copiar URI de redirecionamento" onClick={() => copiar(redirect)}><Copy size={14} aria-hidden="true" /></button>
            </span>
          </li>
          <li>Copie o <b>ID do cliente</b> e a <b>Chave secreta do cliente</b> que o Google mostrar e salve ao lado.</li>
          <li>Em <b>Gestão de Atendimento › Contas de e-mail</b>, abra a conta › Configurações de recebimento › <b>Autorizar com Gmail</b>, entrando no Google com a própria caixa (ex.: cftv@calper.com.br).</li>
        </ol>
        <p className="at-sec__ajuda">Escopo pedido: <code>https://mail.google.com/</code> (ler, marcar e enviar), o mesmo da Movidesk. A autorização de cada caixa pode ser revogada na conta Google (Segurança › Apps de terceiros) ou pelo Admin.</p>
      </section>
    </div>
  );
}

function DelegacaoGoogle() {

  const ids = useId();
  const g = useGoogleWorkspace();
  const salvar = useSalvarChaveGoogle();
  const salvarEscopos = useSalvarEscoposGoogle();
  const testar = useTestarGoogle();
  const { user } = useAccess();
  const [json, setJson] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [caixa, setCaixa] = useState(user?.email ?? "");

  if (g.isPending) return <PageSkeleton />;
  if (g.isError) return <ErrorState message={msgErro(g.error, "Não foi possível carregar a conexão do Google.")} onRetry={() => void g.refetch()} />;

  let clientIdArquivo: string | null = null;
  try {
    clientIdArquivo = json ? ((JSON.parse(json) as { client_id?: string }).client_id ?? null) : null;
  } catch {
    clientIdArquivo = null;
  }
  const clientId = clientIdArquivo ?? g.data.clientId;
  const escoposTexto = g.data.escopos.join(",");
  const modo = igual(g.data.escopos, ESCOPOS_GOOGLE.completo) ? "completo" : igual(g.data.escopos, ESCOPOS_GOOGLE.minimo) ? "minimo" : "outro";
  const v = g.data.verificacao;
  const copiar = (t: string) => void navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));
  const trocarEscopos = (lista: readonly string[]) =>
    salvarEscopos.mutate([...lista], { onSuccess: () => toast.success("Escopos salvos: cadastre os mesmos no Admin do Google"), onError: (e) => toast.error(msgErro(e, "Não foi possível salvar os escopos.")) });

  return (
    <div className="at-grade2">
      <section className="card at-sec" aria-labelledby={`${ids}-t`}>
        <h2 id={`${ids}-t`}>Google Workspace (Contas de e-mail)</h2>
        <p>O portal entra como mais um cliente em <b>Delegação em todo o domínio</b> e lê e envia pelas caixas @calper.com.br sem a senha de cada conta. A chave fica no cofre do Supabase.</p>

        <div className="zv-passo">
          <span className={`zv-passo__ic zv-passo__ic--${g.data.contaServico ? (v ? (v.ok ? "ok" : "pend") : "neutro") : "pend"}`} aria-hidden="true">
            {g.data.contaServico && v?.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          </span>
          <div className="zv-passo__txt">
            <b>1. Chave da conta de serviço</b>
            <span>{g.data.contaServico ? <>Guardada: {g.data.contaServico}{g.data.definidoEm ? ` · ${formatDateTime(g.data.definidoEm)}` : ""}.</> : "Ainda não enviada."}</span>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-arq`}>Arquivo JSON da chave (Google Cloud › IAM e administrador › Contas de serviço › Chaves)</label>
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

        <h2 style={{ marginTop: 6 }}>2. Escopos que o portal pede ao Google</h2>
        <p className="at-sec__ajuda">Precisam ser <b>exatamente</b> os escopos cadastrados para o Client ID em "Clientes da API". Se forem diferentes, o Google recusa (unauthorized_client).</p>
        <div className="em-modo" role="radiogroup" aria-label="Escopos">
          <button type="button" role="radio" aria-checked={modo === "completo"} className={modo === "completo" ? "em-modo--on" : undefined} disabled={salvarEscopos.isPending} onClick={() => trocarEscopos(ESCOPOS_GOOGLE.completo)}>
            <b>Acesso ao Gmail (recomendado)</b>
            <span>https://mail.google.com/ · o mesmo escopo do cliente que a Calper já tem autorizado.</span>
          </button>
          <button type="button" role="radio" aria-checked={modo === "minimo"} className={modo === "minimo" ? "em-modo--on" : undefined} disabled={salvarEscopos.isPending} onClick={() => trocarEscopos(ESCOPOS_GOOGLE.minimo)}>
            <b>Mínimo (ler/marcar e enviar)</b>
            <span>gmail.modify + gmail.send · menos acesso, se a TI preferir.</span>
          </button>
        </div>

        <h2 style={{ marginTop: 6 }}>3. Testar uma caixa</h2>
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
          <li><b>Google Cloud Console</b> (no projeto da Calper) › APIs e serviços › ative a <b>Gmail API</b>.</li>
          <li>IAM e administrador › <b>Contas de serviço</b> › crie "portal-atendimento" › aba Chaves › Adicionar chave › <b>JSON</b>. Envie o arquivo no passo 1 ao lado.</li>
          <li>
            <b>admin.google.com</b> › Segurança › Acesso e controle de dados › Controles de API › <b>Gerenciar a delegação em todo o domínio</b>. É a tela <b>"Clientes da API"</b>, onde a Calper já tem um cliente com <code>https://mail.google.com/</code>.
          </li>
          <li>
            Clique em <b>Adicionar novo</b> e preencha:
            <span className="em-copiar">
              <span>ID do cliente:</span>
              <code>{clientId ?? "aparece aqui depois de enviar o JSON"}</code>
              {clientId && <button type="button" className="icon-btn" aria-label="Copiar ID do cliente" onClick={() => copiar(clientId)}><Copy size={14} aria-hidden="true" /></button>}
            </span>
            <span className="em-copiar">
              <span>Escopos OAuth:</span>
              <code>{escoposTexto}</code>
              <button type="button" className="icon-btn" aria-label="Copiar escopos" onClick={() => copiar(escoposTexto)}><Copy size={14} aria-hidden="true" /></button>
            </span>
            e clique em <b>Autorizar</b>. O novo cliente aparece na lista, ao lado do que já existe.
          </li>
          <li>Volte aqui e use <b>Testar uma caixa</b> com uma conta real (a autorização pode levar alguns minutos para valer).</li>
        </ol>
        {modo === "outro" && <p className="em-aviso">Os escopos salvos não são nenhum dos dois conjuntos acima. Escolha um e cadastre os mesmos no Admin.</p>}
        <p className="at-sec__ajuda">
          <b>O cliente que já está na lista serve?</b> Só se for uma conta de serviço do próprio projeto da Calper e a TI tiver o JSON da chave dele. Para ver de quem é, use "Baixar informações dos clientes" na mesma tela. Se for de outro sistema (ex.: migração de e-mail ou outra ferramenta), deixe como está e crie um cliente novo para o portal.
        </p>
        <p className="at-sec__ajuda"><KeyRound size={13} aria-hidden="true" /> A chave dá acesso às caixas do domínio nos escopos acima. Guarde o arquivo original em local seguro e apague as cópias depois de enviar.</p>
      </section>
    </div>
  );
}
