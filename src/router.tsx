import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";

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
const PosPage = lazy(() =>
  import("./ui/pages/pos-page.js").then((module) => ({ default: module.PosPage }))
);
const FinancePage = lazy(() =>
  import("./ui/pages/finance-page.js").then((module) => ({ default: module.FinancePage }))
);
const SuppliersPage = lazy(() =>
  import("./ui/pages/suppliers-page.js").then((module) => ({ default: module.SuppliersPage }))
);
const SupplierBillsPage = lazy(() =>
  import("./ui/pages/supplier-bills-page.js").then((module) => ({ default: module.SupplierBillsPage }))
);
const ExpensesPage = lazy(() =>
  import("./ui/pages/expenses-page.js").then((module) => ({ default: module.ExpensesPage }))
);
const MarketingPage = lazy(() =>
  import("./ui/pages/marketing-page.js").then((module) => ({ default: module.MarketingPage }))
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

export const router = createHashRouter([
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
            element: <RequireRoles allowedRoles={["admin", "manager", "sales"]} />,
            children: [
              {
                path: "pos",
                element: withSuspense(<PosPage />)
              }
            ]
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
            element: <RequireRoles allowedRoles={["admin", "manager", "sales"]} />,
            children: [
              {
                path: "marketing",
                element: withSuspense(<MarketingPage />)
              }
            ]
          },
          {
            element: <RequireRoles allowedRoles={["admin", "manager"]} />,
            children: [
              {
                path: "finanzas",
                element: withSuspense(<FinancePage />)
              },
              {
                path: "finanzas/proveedores",
                element: withSuspense(<SuppliersPage />)
              },
              {
                path: "finanzas/cxp",
                element: withSuspense(<SupplierBillsPage />)
              },
              {
                path: "finanzas/gastos",
                element: withSuspense(<ExpensesPage />)
              }
            ]
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
