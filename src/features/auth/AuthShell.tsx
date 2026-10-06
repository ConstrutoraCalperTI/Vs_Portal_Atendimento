import { AppWindow, LayoutGrid, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { APP_NAME, COMPANY_NAME } from "../../config/app";
import "./authShell.css";

const FEATURES = [
  { icon: LayoutGrid, text: "Módulos do sistema num só lugar" },
  { icon: AppWindow, text: "Login único da Calper, com permissões por aplicativo" },
  { icon: ShieldCheck, text: "Controle de acesso por perfil" },
];

/**
 * Moldura das telas fora do layout (login, redefinir e trocar senha): painel da marca à esquerda
 * e o card de acesso à direita. No celular, a marca vira uma faixa compacta acima do card.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="auth-shell">
      <aside className="auth-shell__brand" aria-label={`${COMPANY_NAME} · ${APP_NAME}`}>
        <div className="auth-shell__glow" aria-hidden="true" />
        <span className="auth-shell__logo">
          <img src="/calper-logo.webp" alt="Calper" width={48} height={15} />
        </span>

        <div className="auth-shell__pitch">
          <p className="auth-shell__title">{COMPANY_NAME}</p>
          <p className="auth-shell__app">{APP_NAME}</p>
          <p className="auth-shell__text">
            Portal da Calper com login corporativo, perfis de acesso, auditoria e integração com o TOTVS RM.
          </p>
          <ul className="auth-shell__features">
            {FEATURES.map(({ icon: Icon, text }, index) => (
              <li key={text} style={{ animationDelay: `${180 + index * 90}ms` }}>
                <span className="auth-shell__feature-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-shell__copy">© {year} {COMPANY_NAME}</p>
      </aside>

      <main className="auth-shell__main">
        <div className="auth-shell__card-wrap">{children}</div>
        <p className="auth-shell__legal">© {year} {COMPANY_NAME}. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}
