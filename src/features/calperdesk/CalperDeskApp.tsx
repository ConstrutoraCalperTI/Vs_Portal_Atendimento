import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogOut, Ticket } from "lucide-react";
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router";
import { CORPORATE_DOMAIN } from "../../config/app";
import { AppAccessDeniedPopup } from "../auth/AppAccessDeniedPopup";
import { useAuthSession } from "../auth/useAuthSession";
import { AbrirChamado } from "./AbrirChamado";
import { DetalheChamado, MeusChamados } from "./Chamados";
import { calperdesk, type Entrada } from "./service";
import { Avisos, EscolherSetorPelaUrl, Inicio, Perfil, Solucoes } from "./Telas";
import "./calperdesk.css";

// CalperDESK (docs/PLANO-calperdesk.md): app do solicitante em /app, fora do layout do portal e pensado para celular.
// Qualquer @calper.com.br entra (perfil Solicitante no 1º acesso). A Administração abre com ?simular=<usuário> para
// ver o app como a pessoa (só leitura).

const SIMULAR_KEY = "calperdesk-simular";
/** Quem pediu "Primeiro acesso" pelo app volta para o app depois de criar a senha. */
export const VOLTAR_APP_KEY = "calperdesk-voltar";

function lerSessao(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarSessao(chave: string, valor: string | null) {
  try {
    if (valor) sessionStorage.setItem(chave, valor);
    else sessionStorage.removeItem(chave);
  } catch {
    // navegador sem armazenamento: a simulação vale só nesta tela
  }
}

interface Ctx {
  entrada: Entrada;
  /** Usuário simulado (Administração) ou null. */
  como: string | null;
  simulando: boolean;
}
const CdContext = createContext<Ctx | null>(null);

export function useCd(): Ctx {
  const ctx = useContext(CdContext);
  if (!ctx) throw new Error("useCd fora do CalperDESK");
  return ctx;
}

export function Carregando() {
  return (
    <div className="cd-carregando" aria-busy="true" aria-label="Carregando">
      <div />
      <div />
      <div />
    </div>
  );
}

/** Logo "CalperDESK" no visual do "Seu Imóvel" (caixa dourada + nome leve/forte). */
export function Logo({ para = "/app" }: { para?: string }) {
  return (
    <Link to={para} className="cd-logo" aria-label="CalperDESK, início">
      <span className="cd-logo__icone">
        <Ticket size={20} aria-hidden="true" />
      </span>
      <span className="cd-logo__nome">
        <span>Calper</span>
        <b>DESK</b>
      </span>
    </Link>
  );
}

export function Cabecalho({ direita }: { direita?: ReactNode }) {
  const { signOut } = useAuthSession();
  const { simulando } = useCd();
  return (
    <header className="cd-hdr">
      <Logo />
      <div className="cd-hdr__acoes">
        {direita}
        {!simulando && (
          <button type="button" className="cd-pilula" onClick={() => void signOut()}>
            <LogOut size={15} aria-hidden="true" />
            Sair
          </button>
        )}
      </div>
    </header>
  );
}

export function SubCabecalho({ titulo, sub, voltar }: { titulo: string; sub?: ReactNode; voltar: string }) {
  return (
    <div className="cd-sub">
      <Link to={voltar} className="cd-voltar" aria-label="Voltar">
        <ArrowLeft size={18} aria-hidden="true" />
      </Link>
      <div>
        <h2>{titulo}</h2>
        {sub && <p>{sub}</p>}
      </div>
    </div>
  );
}

/** Rota /app/*. */
export function CalperDeskApp() {
  const { status } = useAuthSession();
  const [params] = useSearchParams();
  const pedido = params.get("simular");
  if (pedido) gravarSessao(SIMULAR_KEY, /^[0-9a-f-]{36}$/i.test(pedido) ? pedido : null);

  if (status === "loading") {
    return (
      <div className="cd">
        <div className="cd__col">
          <Carregando />
        </div>
      </div>
    );
  }
  if (status === "signedOut") return <AppLogin />;
  return <AppAutenticado />;
}

function AppAutenticado() {
  const navigate = useNavigate();
  const { email, signOut } = useAuthSession();
  const [como] = useState(() => lerSessao(SIMULAR_KEY));
  const entrada = useQuery({ queryKey: ["cd", "entrada", como], queryFn: () => calperdesk.entrar(como), retry: 1, staleTime: 60_000 });
  // Permissões por aplicativo: o bloqueio manual do Super admin vale também no app (consulta depois do 1º acesso,
  // que cria o cadastro). Na simulação, quem vê é a Administração.
  const acesso = useQuery({ queryKey: ["cd", "acesso"], queryFn: calperdesk.podeAcessar, enabled: entrada.isSuccess && !como, staleTime: 300_000 });
  const [saindo, setSaindo] = useState(false);

  const sairSimulacao = () => {
    gravarSessao(SIMULAR_KEY, null);
    navigate("/gestao-atendimento/calperdesk", { replace: true });
  };

  if (entrada.isPending) {
    return (
      <div className="cd">
        <div className="cd__col">
          <Carregando />
        </div>
      </div>
    );
  }
  if (entrada.isError) {
    return (
      <div className="cd">
        <div className="cd__col">
          <div className="cd__centro">
            <div>
              <p className="cd-alerta">{entrada.error.message}</p>
              <div className="cd-confirma__acoes" style={{ margin: "0 auto" }}>
                <button type="button" className="cd-btn-ouro" onClick={() => void entrada.refetch()}>
                  Tentar de novo
                </button>
                {como ? (
                  <button type="button" className="cd-btn-vidro" onClick={() => sairSimulacao()}>
                    Sair da simulação
                  </button>
                ) : (
                  <button type="button" className="cd-btn-vidro" onClick={() => void signOut()}>
                    Sair
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const ctx: Ctx = { entrada: entrada.data, como, simulando: Boolean(como) };
  return (
    <CdContext.Provider value={ctx}>
      <div className="cd">
        {ctx.simulando && (
          <div className="cd-simula" role="status">
            <span>
              <b>Modo simulação · só leitura</b>
              Vendo o app como {entrada.data.nome}
            </span>
            <button type="button" onClick={sairSimulacao}>
              Sair
            </button>
          </div>
        )}
        <div className="cd__col">
          <Routes>
            <Route index element={<Inicio />} />
            <Route path="d/:setorId" element={<EscolherSetorPelaUrl />} />
            <Route path="avisos" element={<Avisos />} />
            <Route path="d/:setorId/abrir" element={<AbrirChamado />} />
            <Route path="d/:setorId/avisos" element={<Avisos />} />
            <Route path="d/:setorId/solucoes" element={<Solucoes />} />
            <Route path="chamados" element={<MeusChamados />} />
            <Route path="chamados/:id" element={<DetalheChamado />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>
      </div>
      {acesso.data === false && (
        <AppAccessDeniedPopup
          open
          onOpenChange={() => {}}
          email={email}
          signingOut={saindo}
          onSignOut={() => {
            setSaindo(true);
            void signOut();
          }}
        />
      )}
    </CdContext.Provider>
  );
}

/** Login do app: mesmo gateway seguro do portal, com o visual do CalperDESK. "Primeiro acesso" cria a conta. */
function AppLogin() {
  const { signIn, requestPasswordReset, notice, clearNotice } = useAuthSession();
  const [modo, setModo] = useState<"entrar" | "link">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const emailValido = new RegExp(`^[^\\s@]+@${CORPORATE_DOMAIN.replace(".", "\\.")}$`, "i").test(email.trim());

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOk(null);
    clearNotice();
    if (!emailValido) {
      setErro(`Use o seu e-mail @${CORPORATE_DOMAIN}.`);
      return;
    }
    setEnviando(true);
    try {
      if (modo === "entrar") {
        if (!senha) {
          setErro("Digite a sua senha.");
          return;
        }
        await signIn(email, senha);
      } else {
        await requestPasswordReset(email);
        gravarLocal(VOLTAR_APP_KEY, "1");
        setOk("Pronto! Se o e-mail for da Calper, você vai receber um link para criar a sua senha. Confira também o lixo eletrônico.");
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const mensagem = erro ?? notice;
  return (
    <div className="cd">
      <div className="cd__col">
        <div className="cd-login">
          <Logo para="/app" />
          <h1>{modo === "entrar" ? "Entrar" : "Primeiro acesso"}</h1>
          <p>
            {modo === "entrar"
              ? `Use seu e-mail @${CORPORATE_DOMAIN} e sua senha.`
              : "Digite seu e-mail da Calper. Enviaremos um link para você criar (ou trocar) a sua senha."}
          </p>
          {mensagem && (
            <p className="cd-alerta" role="alert">
              {mensagem}
            </p>
          )}
          {ok && (
            <p className="cd-login__ok" role="status">
              {ok}
            </p>
          )}
          <form onSubmit={(e) => void enviar(e)} noValidate>
            <label className="cd-rot" htmlFor="cd-email" style={{ margin: 0 }}>
              E-mail
            </label>
            <input
              id="cd-email"
              className="cd-campo"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder={`nome@${CORPORATE_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {modo === "entrar" && (
              <>
                <label className="cd-rot" htmlFor="cd-senha" style={{ margin: "4px 0 0" }}>
                  Senha
                </label>
                <input
                  id="cd-senha"
                  className="cd-campo"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </>
            )}
            <button type="submit" className="cd-btn-ouro" disabled={enviando} style={{ marginTop: 8 }}>
              {enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Enviar link"}
            </button>
          </form>
          <small>
            {modo === "entrar" ? (
              <button type="button" className="cd-link" onClick={() => { setModo("link"); setErro(null); setOk(null); }}>
                Primeiro acesso ou esqueci a senha
              </button>
            ) : (
              <button type="button" className="cd-link" onClick={() => { setModo("entrar"); setErro(null); setOk(null); }}>
                Voltar para entrar
              </button>
            )}
          </small>
          <small>Só e-mails @{CORPORATE_DOMAIN}. No 1º acesso você entra como Solicitante.</small>
        </div>
      </div>
    </div>
  );
}

function gravarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento: depois de criar a senha, cai no login do portal (que manda de volta ao app)
  }
}
