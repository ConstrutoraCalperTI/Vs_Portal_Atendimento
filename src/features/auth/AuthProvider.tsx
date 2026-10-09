import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { isAllowedLoginEmail, STORAGE_PREFIX } from "../../config/app";
<<<<<<< HEAD
import { LOGIN_FAILED_MESSAGE, OFFLINE_MESSAGE, requestResetThroughGateway, signInThroughGateway } from "../../lib/authGateway";
import { SUPABASE_CONFIGURED, supabase } from "../../lib/supabase";
=======
import { SUPABASE_CONFIGURED, takeRecoveryLinkFlag, SUPABASE_KEY_HINT, supabase } from "../../lib/supabase";
>>>>>>> 969f4e94ea2cfbcbb657fa4ceda78e80909e3abe
import { authService } from "../configuracoes/services";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { AuthFailure, DOMAIN_NOT_ALLOWED, toAuthFailure } from "./authErrors";

/** Login real (Supabase Auth, e-mail e senha). Só e-mails do domínio corporativo ficam logados. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return SUPABASE_CONFIGURED ? <SupabaseAuthProvider>{children}</SupabaseAuthProvider> : <SimulatedAuthProvider>{children}</SimulatedAuthProvider>;
}

const SIMULATED_SESSION_KEY = `${STORAGE_PREFIX}:sessao-simulada`;

function readSimulatedEmail(): string | null {
  try {
    return sessionStorage.getItem(SIMULATED_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSimulatedEmail(value: string | null) {
  try {
    if (value) sessionStorage.setItem(SIMULATED_SESSION_KEY, value);
    else sessionStorage.removeItem(SIMULATED_SESSION_KEY);
  } catch {
    // Sem sessionStorage (aba privada): a sessão simulada vale só até recarregar.
  }
}

/**
 * Sem Supabase no .env.local: login simulado para ver e testar o modelo (dados em memória).
 * Qualquer e-mail do domínio corporativo e qualquer senha preenchida entram. A sessão fica só na aba.
 */
function SimulatedAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);

  const apply = useCallback(
    async (next: string | null) => {
      await authService.bindSession(next);
      writeSimulatedEmail(next);
      if (!next) queryClient.removeQueries();
      setEmail(next);
      setStatus(next ? "signedIn" : "signedOut");
    },
    [queryClient],
  );

  useEffect(() => {
    void apply(readSimulatedEmail());
  }, [apply]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      email,
      notice: null,
      clearNotice: () => {},
      signIn: async (loginEmail, password) => {
        const normalized = loginEmail.trim().toLowerCase();
        if (!isAllowedLoginEmail(normalized)) throw new AuthFailure(DOMAIN_NOT_ALLOWED);
        if (!password) throw new AuthFailure("Informe a senha.");
        await apply(normalized);
      },
      signOut: async () => {
        await authService.endSession();
        await apply(null);
      },
      requestPasswordReset: async (resetEmail) => {
        if (!isAllowedLoginEmail(resetEmail.trim().toLowerCase())) throw new AuthFailure(DOMAIN_NOT_ALLOWED);
      },
    }),
    [status, email, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** A sessão salva ainda vale no portal? Falha de rede não derruba ninguém (a RLS nega de qualquer forma). */
async function sessionTrusted(): Promise<boolean> {
  const { data, error } = await supabase.rpc("sessao_atual_confiavel");
  return error ? true : data === true;
}

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // O navigate muda a cada rota; no efeito do Auth isso reassinaria o listener a cada navegação.
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let active = true;

    const apply = async (session: Session | null) => {
      const sessionEmail = session?.user.email?.toLowerCase() ?? null;
      if (sessionEmail && !isAllowedLoginEmail(sessionEmail)) {
        // Conta de outro sistema do projeto compartilhado: não usa o portal.
        if (active) setNotice(DOMAIN_NOT_ALLOWED);
        await supabase.auth.signOut();
        return; // o SIGNED_OUT que vem em seguida chama apply(null)
      }
      if (session && !(await sessionTrusted())) {
        // Sessão que o portal não aceita mais (aberta direto no Auth, encerrada por um admin ou
        // anterior ao gateway de login): descarta e pede login de novo.
        if (active) setNotice("Sua sessão expirou. Entre novamente.");
        await supabase.auth.signOut({ scope: "local" });
        return;
      }
      await authService.bindSession(sessionEmail);
      if (!active) return;
      if (!sessionEmail) queryClient.removeQueries();
      setEmail(sessionEmail);
      setStatus(sessionEmail ? "signedIn" : "signedOut");
    };

    // Dispara INITIAL_SESSION ao assinar, então não é preciso chamar getSession().
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Chamadas ao Supabase dentro deste callback podem travar (recomendação do supabase-js): adia.
      setTimeout(() => void apply(session), 0);
      // Sessão de recuperação aberta em outra rota: leva para criar a nova senha.
      const recovery = event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && takeRecoveryLinkFlag());
      if (session && recovery && location.pathname !== "/redefinir-senha") {
        navigateRef.current("/redefinir-senha", { replace: true });
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      email,
      notice,
      clearNotice: () => setNotice(null),
      signIn: async (loginEmail, password) => {
        const normalized = loginEmail.trim().toLowerCase();
        // Só ajuda quem digitou o domínio errado; o gateway recusa de novo no servidor.
        if (!isAllowedLoginEmail(normalized)) throw new AuthFailure(DOMAIN_NOT_ALLOWED);
        // Limites, bloqueio e risco são decididos no servidor (gateway). Resposta única para qualquer motivo.
        const result = await signInThroughGateway(normalized, password);
        if (!result.ok) throw new AuthFailure(result.offline ? OFFLINE_MESSAGE : LOGIN_FAILED_MESSAGE);
      },
      signOut: async () => {
        await authService.endSession();
        const { error } = await supabase.auth.signOut();
        if (error) throw toAuthFailure(error, "Não foi possível sair. Tente novamente.");
        // Já marca como deslogado: quem navega logo em seguida para /login não é devolvido para /home
        // pelo status antigo (o SIGNED_OUT do listener chega depois, adiado).
        setEmail(null);
        setStatus("signedOut");
      },
      requestPasswordReset: async (resetEmail) => {
        const normalized = resetEmail.trim().toLowerCase();
        if (!isAllowedLoginEmail(normalized)) throw new AuthFailure(DOMAIN_NOT_ALLOWED);
        // O gateway devolve sempre a mesma resposta (exista ou não a conta) e monta o link de volta.
        const result = await requestResetThroughGateway(normalized);
        if (!result.ok && result.offline) throw new AuthFailure(OFFLINE_MESSAGE);
      },
    }),
    [status, email, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
