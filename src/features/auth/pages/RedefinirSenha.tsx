import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useChangePassword } from "../../configuracoes/hooks/useAuth";
import { AuthShell } from "../AuthShell";
import { NewPasswordForm } from "../NewPasswordForm";
import { useAuthSession } from "../useAuthSession";
import "../authCard.css";

/** Destino do link de "Esqueci minha senha": o Supabase abre uma sessão de recuperação e aqui se define a nova senha. */
export function RedefinirSenha() {
  const { status } = useAuthSession();
  // Troca a senha no Auth e conclui convite/troca obrigatória no portal (usuário vira ativo).
  const changePassword = useChangePassword();
  const navigate = useNavigate();

  if (status === "loading") {
    return (
      <div className="auth-page">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <AuthShell>
      <div className="card auth-card">
        {status === "signedIn" ? (
          <>
            <h1>Crie uma nova senha</h1>
            <p>Escolha uma senha que você ainda não usou neste portal.</p>
            <NewPasswordForm
              submitLabel="Salvar nova senha"
              onSave={async (password) => {
                await changePassword.mutateAsync(password);
                toast.success("Senha alterada com sucesso");
                navigate("/home", { replace: true });
              }}
            />
          </>
        ) : (
          <>
            <h1>Link inválido ou expirado</h1>
            <p>Peça um novo link em “Esqueci minha senha”. Por segurança, cada link vale uma única vez.</p>
            <Link to="/login" className="btn btn--primary btn--lg auth-card__submit">
              Voltar para o login
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
