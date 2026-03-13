import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../auth/auth-provider.js";
import { getUserProfile } from "../../lib/firestore.js";

const navigation = [
  { to: "/", label: "Resumen", shortLabel: "Inicio" },
  { to: "/pos", label: "POS", shortLabel: "Caja" },
  { to: "/clientes", label: "Clientes", shortLabel: "Clientes" },
  { to: "/inventario", label: "Inventario", shortLabel: "Stock" },
  { to: "/produccion", label: "Produccion", shortLabel: "Lotes" },
  { to: "/ventas", label: "Ventas", shortLabel: "Ventas" },
  { to: "/finanzas", label: "Finanzas", shortLabel: "Finanzas" },
  { to: "/marketing", label: "Marketing", shortLabel: "Mkt" },
  { to: "/reportes", label: "Reportes", shortLabel: "Reportes" },
  { to: "/ajustes", label: "Ajustes", shortLabel: "Admin" }
];

export function RootLayout() {
  const location = useLocation();
  const { isAnonymous, logout, user } = useAuth();
  const userProfileQuery = useQuery({
    queryKey: ["users", user?.uid],
    queryFn: () => getUserProfile(user!.uid),
    enabled: Boolean(user?.uid) && !isAnonymous
  });
  const activeLabel =
    navigation.find((item) =>
      item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
    )?.label ?? "Sistema";

  return (
    <div className="app-shell">
      <aside className="sidebar-shell hidden border-r border-[var(--color-line)] px-6 py-8 backdrop-blur lg:flex lg:flex-col">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-brand)]">
            <span className="pulse-dot" />
            PEDAiCAFE
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-[var(--color-ink)]">
            Sistema de
            <span className="block text-[var(--color-brand)]">Gestion de Cafe</span>
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-6 text-[var(--color-ink-soft)]">
            Control operativo para clientes, produccion, inventario y ventas con tasa diaria USD/VES.
          </p>
        </div>

        <nav className="relative z-10 mt-10 flex flex-col gap-2">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `nav-pill rounded-[24px] px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-deep))] text-white shadow-[0_18px_30px_rgba(10,67,52,0.18)]"
                    : "bg-white/55 text-[var(--color-ink-soft)] hover:bg-white/88 hover:text-[var(--color-ink)]"
                }`
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span>{item.label}</span>
                <span className="text-[10px] uppercase tracking-[0.18em] opacity-65">
                  {item.shortLabel}
                </span>
              </div>
            </NavLink>
          ))}
        </nav>

        <div className="panel-strong relative z-10 mt-auto rounded-[30px] p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Operacion</p>
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
            Proyecto conectado a Firestore con base lista para autenticacion, CRUD y reportes.
          </p>
          <div className="mt-5 space-y-3">
            {[
              ["Estado", "Activo"],
              ["Modo", "MVP"],
              ["Moneda", "USD / VES"]
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-[20px] bg-white/78 px-3 py-3"
              >
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                  {label}
                </span>
                <span className="text-sm font-semibold text-[var(--color-ink)]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="min-w-0 px-4 pb-28 pt-4 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
        <header className="topbar-shell glass-card reveal rounded-[30px] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Vista activa
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-[var(--color-ink)] sm:text-3xl">
                {activeLabel}
              </h2>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                Panel operativo mobile-first para ventas, inventario, produccion y cartera.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <div className="rounded-2xl bg-[var(--color-brand-soft)] px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand-deep)]">
                  Monedas
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--color-brand-deep)]">USD / VES</p>
              </div>
              <div className="rounded-2xl bg-white/82 px-4 py-3 text-right ring-1 ring-[var(--color-line)]">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
                  Sesion
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--color-ink)]">
                  {isAnonymous ? "Invitado" : user?.email ?? "Usuario"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                  {isAnonymous
                    ? "guest"
                    : userProfileQuery.data?.role ?? "sin perfil"}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="pt-5">
          <Outlet />
        </main>
      </div>

      <nav className="topbar-shell glass-card fixed inset-x-4 bottom-4 z-20 rounded-[28px] px-2 py-2 lg:hidden">
        <div className="grid grid-cols-9 gap-1">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `rounded-[22px] px-2 py-3 text-center text-[11px] font-medium transition ${
                  isActive
                    ? "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-deep))] text-white shadow-[0_14px_24px_rgba(10,67,52,0.18)]"
                    : "text-[var(--color-ink-soft)]"
                }`
              }
            >
              {item.shortLabel}
            </NavLink>
          ))}
        </div>
      </nav>

      <button
        className="fixed right-4 top-4 z-30 hidden rounded-full bg-[var(--color-danger-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)] shadow-[0_12px_24px_rgba(200,74,52,0.12)] lg:inline-flex"
        onClick={() => {
          void logout();
        }}
        type="button"
      >
        Salir
      </button>
    </div>
  );
}
