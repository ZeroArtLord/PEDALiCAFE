import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";

import { RedirectIfAuthenticated, RequireAuth, RequireRoles } from "./auth/route-guards.js";
import { RouteFallback } from "./ui/components/route-fallback.js";
import { RootLayout } from "./ui/layout/root-layout.js";

const DashboardPage = lazy(() =>
  import("./ui/pages/dashboard-page.js").then((module) => ({ default: module.DashboardPage }))
);
const CustomersPage = lazy(() =>
  import("./ui/pages/customers-page.js").then((module) => ({ default: module.CustomersPage }))
);
const InventoryPage = lazy(() =>
  import("./ui/pages/inventory-page.js").then((module) => ({ default: module.InventoryPage }))
);
const LoginPage = lazy(() =>
  import("./ui/pages/login-page.js").then((module) => ({ default: module.LoginPage }))
);
const ProductionPage = lazy(() =>
  import("./ui/pages/production-page.js").then((module) => ({ default: module.ProductionPage }))
);
const SalesPage = lazy(() =>
  import("./ui/pages/sales-page.js").then((module) => ({ default: module.SalesPage }))
);
const ReportsPage = lazy(() =>
  import("./ui/pages/reports-page.js").then((module) => ({ default: module.ReportsPage }))
);
const SettingsPage = lazy(() =>
  import("./ui/pages/settings-page.js").then((module) => ({ default: module.SettingsPage }))
);

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [
      {
        path: "/login",
        element: withSuspense(<LoginPage />)
      }
    ]
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <RootLayout />,
        children: [
          {
            index: true,
            element: withSuspense(<DashboardPage />)
          },
          {
            path: "clientes",
            element: withSuspense(<CustomersPage />)
          },
          {
            path: "inventario",
            element: withSuspense(<InventoryPage />)
          },
          {
            path: "produccion",
            element: withSuspense(<ProductionPage />)
          },
          {
            path: "ventas",
            element: withSuspense(<SalesPage />)
          },
          {
            path: "reportes",
            element: withSuspense(<ReportsPage />)
          },
          {
            element: <RequireRoles allowedRoles={["admin", "manager"]} />,
            children: [
              {
                path: "ajustes",
                element: withSuspense(<SettingsPage />)
              }
            ]
          }
        ]
      }
    ]
  }
]);
