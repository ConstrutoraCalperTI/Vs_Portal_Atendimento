import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import "./Notice.css";

interface NoticeProps {
  icon: LucideIcon;
  children: ReactNode;
}

/** Aviso informativo azul no topo das telas (ex.: segredos, uma sessão por usuário). */
export function Notice({ icon: Icon, children }: NoticeProps) {
  return (
    <div className="notice" role="note">
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
