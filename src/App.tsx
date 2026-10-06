import { lazy, Suspense, type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router";
import { CONFIG_ROOT_PATH, menuRegistry, routeChildrenOf, type TopLevelMenuId } from "./config/menuRegistry";
import { CHANGE_PASSWORD_PATH } from "./features/configuracoes/access/PasswordGate";
import { PageSkeleton } from "./components/PageSkeleton";
import { LOGIN_PATH, RequireSession } from "./features/auth/RequireSession";
import { VisaoGeral } from "./features/configuracoes/pages/VisaoGeral";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

// Telas de Configurações carregam sob demanda (formulários, zod e diálogos ficam fora do bundle inicial).
const Usuarios = lazy(() => import("./features/configuracoes/pages/Usuarios").then((m) => ({ default: m.Usuarios })));
const PerfisPermissoes = lazy(() =>
  import("./features/configuracoes/pages/PerfisPermissoes").then((m) => ({ default: m.PerfisPermissoes })),
);
const Integracoes = lazy(() =>
  import("./features/configuracoes/pages/Integracoes").then((m) => ({ default: m.Integracoes })),
);
const GestaoAtendimento = lazy(() => import("./pages/GestaoAtendimento").then((m) => ({ default: m.GestaoAtendimento })));
const PermissoesAplicativo = lazy(() =>
  import("./features/configuracoes/pages/PermissoesAplicativo").then((m) => ({ default: m.PermissoesAplicativo })),
);
const Auditoria = lazy(() => import("./features/configuracoes/pages/Auditoria").then((m) => ({ default: m.Auditoria })));
const Sessoes = lazy(() => import("./features/configuracoes/pages/Sessoes").then((m) => ({ default: m.Sessoes })));
// Telas de autenticação também sob demanda.
const Login = lazy(() => import("./features/auth/pages/Login").then((m) => ({ default: m.Login })));
const RedefinirSenha = lazy(() =>
  import("./features/auth/pages/RedefinirSenha").then((m) => ({ default: m.RedefinirSenha })),
);
const TrocarSenha = lazy(() =>
  import("./features/configuracoes/pages/TrocarSenha").then((m) => ({ default: m.TrocarSenha })),
);

// Tela de cada item do menuRegistry. O Record obriga todo item registrado a ter
// uma página; as rotas em si são geradas a partir do registro. Seções (itens com `parent`)
// são rotas internas da tela do pai, que recebe o caminho com "/*".
const pages: Record<TopLevelMenuId, ReactElement> = {
  home: <Home />,
  gestao_atendimento: <GestaoAtendimento />,
  manage_users: <Usuarios />,
  manage_permissions: <PerfisPermissoes />,
  manage_app_access: <PermissoesAplicativo />,
  configure_integrations: <Integracoes />,
  view_audit_logs: <Auditoria />,
  manage_sessions: <Sessoes />,
};

/** Tela fora do layout carregada sob demanda. */
function Standalone({ children }: { children: ReactElement }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

function App() {
  return (
    <Routes>
      {/* Públicas: entrada e destino do link de "Esqueci minha senha". */}
      <Route path={LOGIN_PATH} element={<Standalone><Login /></Standalone>} />
      <Route path="/redefinir-senha" element={<Standalone><RedefinirSenha /></Standalone>} />

      {/* Autenticado, mas fora do layout: a troca de senha bloqueia o resto do portal. */}
      <Route
        path={CHANGE_PASSWORD_PATH}
        element={
          <RequireSession>
            <Standalone>
              <TrocarSenha />
            </Standalone>
          </RequireSession>
        }
      />

      <Route
        element={
          <RequireSession>
            <ProtectedLayout />
          </RequireSession>
        }
      >
        <Route index element={<Navigate to="/home" replace />} />
        <Route path={CONFIG_ROOT_PATH} element={<VisaoGeral />} />
        {menuRegistry.map((item) =>
          item.parent ? null : (
            <Route
              key={item.id}
              path={routeChildrenOf(item.id).length > 0 || item.subroutes ? `${item.path}/*` : item.path}
              element={pages[item.id as TopLevelMenuId]}
            />
          ),
        )}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
