import { ShieldOff, UserX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { APP_ACCESS_DENIED_MESSAGE, AppAccessDeniedPopup } from "../../auth/AppAccessDeniedPopup";
import { useAuthSession } from "../../auth/useAuthSession";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { PasswordGate } from "./PasswordGate";
import { RequirePermission } from "./RequirePermission";
import { useAccess } from "./useAccess";

/**
 * Guard do layout protegido (a sessão do Supabase já foi exigida pelo RequireSession), nesta ordem:
 * 1. carregando → skeleton; 2. e-mail sem acesso ao portal → aviso com "Sair";
 * 3. troca de senha obrigatória → /trocar-senha; 4. sem perfil → aviso;
 * 5. sem permissão para a rota → /home com toast.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const { isLoading, isError, errorCode, refetch, role } = useAccess();

  if (isLoading) return <PageSkeleton />;
  if (isError && (errorCode === "NO_PORTAL_ACCESS" || errorCode === "NO_APP_ACCESS")) {
    return <NoPortalAccess blockedByApp={errorCode === "NO_APP_ACCESS"} />;
  }
  if (isError) {
    return <ErrorState message="Não foi possível carregar as suas permissões." onRetry={refetch} />;
  }

  return (
    <PasswordGate>
      {role ? (
        <RequirePermission>{children}</RequirePermission>
      ) : (
        <div className="card">
          <EmptyState
            icon={UserX}
            title="Sem perfil atribuído"
            description="A sua conta ainda não tem um perfil de acesso. Peça a um administrador para atribuir um."
          />
        </div>
      )}
    </PasswordGate>
  );
}

/**
 * Entrou com uma conta @calper.com.br válida, mas que não está cadastrada (ou está inativa) no portal,
 * ou que foi bloqueada neste aplicativo em Permissões por aplicativo.
 */
function NoPortalAccess({ blockedByApp }: { blockedByApp: boolean }) {
  const { email, signOut } = useAuthSession();
  const [signingOut, setSigningOut] = useState(false);
  // Pop-up de Permissões por aplicativo: abre sozinho ao entrar bloqueado; o cartão fica por trás.
  const [popupOpen, setPopupOpen] = useState(blockedByApp);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível sair.");
      setSigningOut(false);
    }
  };

  return (
    <div className="card">
      {blockedByApp && (
        <AppAccessDeniedPopup
          open={popupOpen}
          onOpenChange={setPopupOpen}
          email={email}
          signingOut={signingOut}
          onSignOut={() => void handleSignOut()}
        />
      )}
      <EmptyState
        icon={ShieldOff}
        title={blockedByApp ? "Sem permissão nessa aplicação" : "Acesso ao portal não liberado"}
        description={
          blockedByApp
            ? `${APP_ACCESS_DENIED_MESSAGE} (login ${email ?? ""})`
            : `A conta ${email ?? ""} ainda não está autorizada neste portal. Peça a um administrador para cadastrá-la.`
        }
        action={
          <button type="button" className="btn btn--outline" disabled={signingOut} onClick={() => void handleSignOut()}>
            Sair e entrar com outra conta
          </button>
        }
      />
    </div>
  );
}
