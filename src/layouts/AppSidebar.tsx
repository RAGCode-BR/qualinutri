import logoUrl from "../assets/qualinutri-logo.png";
import { useAuth } from "../app/AuthProvider";
import type { ProfileRole as Role } from "../types/auth";

export type TabId = "calculator" | "discounts" | "terms" | "prices" | "freight" | "policy" | "customers" | "quotes" | "reports" | "users";

const navItems: Array<{ id: TabId; label: string }> = [
  { id: "calculator", label: "Calculadora" },
  { id: "quotes", label: "Orçamentos" },
  { id: "prices", label: "Produtos" },
  { id: "customers", label: "Clientes" },
  { id: "discounts", label: "Descontos" },
  { id: "terms", label: "Condições" },
  { id: "freight", label: "Frete" },
  { id: "reports", label: "Relatórios" },
  { id: "policy", label: "Política comercial" },
  { id: "users", label: "Usuários" },
];

export const tabLabels = Object.fromEntries(navItems.map((item) => [item.id, item.label])) as Record<TabId, string>;

/** Páginas fora do menu para todos os perfis. O código continua no projeto. */
const hiddenTabs: ReadonlySet<TabId> = new Set<TabId>(["policy"]);

export function canAccessTab(tab: TabId, role: Role | undefined) {
  if (hiddenTabs.has(tab)) return false;
  if (tab === "users") return role === "administrador";
  if (tab === "customers" || tab === "quotes" || tab === "reports") return role === "administrador" || role === "comercial";
  return true;
}

const roleLabels: Record<Role, string> = {
  administrador: "Administrador",
  comercial: "Comercial",
  consulta: "Consulta",
};

type AppSidebarProps = {
  activeTab: TabId;
  open: boolean;
  onChange: (tab: TabId) => void;
  onClose: () => void;
};

export function AppSidebar({ activeTab, open, onChange, onClose }: AppSidebarProps) {
  const { profile, signOut } = useAuth();
  const visibleItems = navItems.filter((item) => canAccessTab(item.id, profile?.role));

  return (
    <>
      <aside id="app-sidebar" className={`app-sidebar${open ? " is-open" : ""}`}>
        <div className="sidebar-brand">
          <img src={logoUrl} alt="Qualinutri Nutrição Animal" />
        </div>
        <nav aria-label="Áreas do sistema">
          <ul className="nav-list">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={activeTab === item.id ? "page" : undefined}
                  onClick={() => onChange(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-session">
          <div>
            <strong>{profile?.displayName || profile?.login}</strong>
            {profile?.role && <span>{roleLabels[profile.role]}</span>}
          </div>
          <button type="button" onClick={() => void signOut()}>Sair</button>
        </div>
      </aside>
      {open && <div className="sidebar-backdrop" aria-hidden="true" onClick={onClose} />}
    </>
  );
}
