import { AuthError } from "@supabase/supabase-js";
import { CORPORATE_DOMAIN } from "../../config/app";

export const DOMAIN_NOT_ALLOWED = `Somente e-mails @${CORPORATE_DOMAIN} podem acessar o portal.`;

/** Erro de autenticação já com a mensagem pronta para a tela. */
export class AuthFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthFailure";
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme o seu e-mail antes de entrar.",
  user_banned: "Este acesso está bloqueado. Fale com um administrador.",
  over_request_rate_limit: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos.",
  same_password: "A nova senha precisa ser diferente da atual.",
  weak_password: "A senha não atende aos requisitos de segurança.",
  session_not_found: "O link expirou. Peça um novo em “Esqueci minha senha”.",
};

/** Traduz o erro do Supabase Auth; nunca repassa a mensagem técnica em inglês para a tela. */
export function toAuthFailure(error: unknown, fallback: string): AuthFailure {
  if (error instanceof AuthFailure) return error;
  if (error instanceof AuthError) {
    const message = (error.code && MESSAGES[error.code]) || (error.status === 429 ? MESSAGES.over_request_rate_limit : null);
    if (message) return new AuthFailure(message);
    // Erro fora da lista: mostra o código (sem dado sensível) para o diagnóstico, e o detalhe vai para o console.
    console.error("[auth] erro não mapeado", error.name, error.status, error.code, error.message);
    if (!error.status) return new AuthFailure("Sem conexão com o servidor de login. Confira a internet e tente de novo.");
    return new AuthFailure(`${fallback.replace(/\.$/, "")} (código: ${error.code ?? `HTTP ${error.status}`}).`);
  }
  console.error("[auth] erro inesperado", error);
  return new AuthFailure(fallback);
}
