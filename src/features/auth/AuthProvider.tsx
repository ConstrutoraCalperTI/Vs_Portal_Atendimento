import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { isAllowedLoginEmail, STORAGE_PREFIX } from "../../config/app";
import { SUPABASE_CONFIGURED, SUPABASE_KEY_HINT, supabase } from "../../lib/supabase";
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

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      await authService.bindSession(sessionEmail);
      if (!active) return;
      if (!sessionEmail) queryClient.removeQueries();
      setEmail(sessionEmail);
      setStatus(sessionEmail ? "signedIn" : "signedOut");
    };

    // Dispara INITIAL_SESSION ao assinar, então não é preciso chamar getSession().
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Chamadas ao Supabase dentro deste callback podem travar (recomendação do supabase-js): adia.
      setTimeout(() => void apply(session), 0);
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
        // Nem chega ao Supabase: evita criar sessão de conta de fora do domínio.
        if (!isAllowedLoginEmail(normalized)) throw new AuthFailure(DOMAIN_NOT_ALLOWED);
        const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
        if (error) {
          // 401 no login = a chave pública deste build foi recusada (senha errada dá 400 invalid_credentials).
          if (error.status === 401) {
            console.error("[auth] chave pública recusada pelo Supabase:", SUPABASE_KEY_HINT);
            throw new AuthFailure("O servidor de login recusou a chave do aplicativo (HTTP 401). Avise o administrador: confira VITE_SUPABASE_ANON_KEY na hospedagem e publique de novo.");
          }
          throw toAuthFailure(error, "Não foi possível entrar. Tente novamente.");
        }
      },
      signOut: async () => {
        await authService.endSession();
        const { error } = await supabase.auth.signOut();
        if (error) throw toAuthFailure(error, "Não foi possível sair. Tente novamente.");
      },
      requestPasswordReset: async (resetEmail) => {
        const normalized = resetEmail.trim().toLowerCase();
        if (!isAllowedLoginEmail(normalized)) throw new AuthFailure(DOMAIN_NOT_ALLOWED);
        const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        });
        if (error) throw toAuthFailure(error, "Não foi possível enviar o link. Tente novamente.");
      },
    }),
    [status, email, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
