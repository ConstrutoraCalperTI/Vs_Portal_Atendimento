import { AuthError } from "@supabase/supabase-js";
import { supabase } from "../../../../lib/supabase";
import type { AuthService } from "../contracts";
import { ServiceError } from "../types";
import { fromPostgrest } from "./errors";

export const supabaseAuthService: AuthService = {
  async bindSession(email) {
    // O JWT já identifica o usuário; aqui só marca o último acesso (e conclui convite de quem já tinha senha).
    if (email) await supabase.rpc("registrar_acesso");
  },

  async changePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const code = error instanceof AuthError ? error.code : undefined;
      if (code === "same_password") {
        // A senha atual é a temporária (ou a do link de redefinição).
        throw new ServiceError("PASSWORD_REUSED", "A nova senha precisa ser diferente da atual.", "newPassword");
      }
      if (code === "weak_password") {
        throw new ServiceError("INVALID_PASSWORD", "A senha não atende aos requisitos de segurança.", "newPassword");
      }
      throw new ServiceError("INTERNAL", "Não foi possível salvar a nova senha. Tente novamente.");
    }
    // Libera o acesso de quem tinha troca obrigatória ou convite pendente.
    const done = await supabase.rpc("concluir_troca_senha");
    if (done.error) {
      const serviceError = fromPostgrest(done.error);
      // Redefinição de uma conta Calper que não usa o portal: a senha mudou, não há o que concluir aqui.
      if (serviceError.code !== "NO_PORTAL_ACCESS") throw serviceError;
    }
  },

  async verifyCurrentPassword(password) {
    // Reautentica com a senha informada: prova que é o próprio usuário e atende à "troca segura de senha" do Auth.
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new ServiceError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const code = error instanceof AuthError ? error.code : undefined;
      if (code === "invalid_credentials" || error.status === 400) {
        throw new ServiceError("INVALID_PASSWORD", "A senha atual está incorreta.", "currentPassword");
      }
      if (error.status === 429) throw new ServiceError("INTERNAL", "Muitas tentativas. Aguarde alguns minutos.");
      throw new ServiceError("INTERNAL", "Não foi possível conferir a senha atual. Tente novamente.");
    }
  },

  async endSession() {
    // O signOut do Supabase Auth é feito pelo AuthProvider.
  },

  async listSwitchableUsers() {
    return [];
  },

  async switchUser() {
    throw new ServiceError("FORBIDDEN", "O “Ver como” só existe no modo de demonstração.");
  },
};
