import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LuChartNoAxesCombined,
  LuGauge,
  LuLifeBuoy,
  LuShieldCheck,
  LuUsers,
} from "react-icons/lu";

const TABS = [
  { label: "Overview", path: "/admin", icon: LuChartNoAxesCombined, exact: true },
  { label: "Users", path: "/admin/users", icon: LuUsers },
  { label: "Moderation", path: "/admin/discover-moderation", icon: LuShieldCheck },
  { label: "Help reports", path: "/admin/help-reports", icon: LuLifeBuoy },
  { label: "Usage limits", path: "/admin/usage-limits", icon: LuGauge },
] as const;

export default function AdminShell({
  children,
  title,
  actions,
}: {
  children: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden color-bg">
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-[color-mix(in_srgb,var(--theme-txt-sub)_14%,transparent)] px-4 py-6 flex-col">
        <div className="px-3 mb-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] color-txt-sub">CertChamps</p>
          <p className="mt-1 text-lg font-bold color-txt-main">Admin</p>
        </div>
        <nav aria-label="Admin navigation" className="space-y-1">
          {TABS.map((tab) => {
            const active = "exact" in tab && tab.exact
              ? location.pathname === tab.path
              : location.pathname.startsWith(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-left transition-[background-color,color,transform] duration-150 active:scale-[0.98] ${
                  active ? "color-bg-accent color-txt-accent" : "color-txt-sub hover:color-bg-grey-5 hover:color-txt-main"
                }`}
              >
                <Icon size={17} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto scrollbar-minimal">
        <div className="w-full max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <h1 className="text-2xl font-bold tracking-[-0.025em] color-txt-main">{title}</h1>
            {actions}
          </div>
          <nav aria-label="Admin navigation" className="lg:hidden flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-minimal">
            {TABS.map((tab) => {
              const active = "exact" in tab && tab.exact
                ? location.pathname === tab.path
                : location.pathname.startsWith(tab.path);
              return (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => navigate(tab.path)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${active ? "color-bg-accent color-txt-accent" : "color-bg-grey-5 color-txt-sub"}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
          {children}
        </div>
      </main>
    </div>
  );
}

