import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { listDocuments } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatVes(value: number) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "VES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado al consultar Firestore.";
}

export function FinancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  const salesQuery = useQuery({
    queryKey: ["sales"],
    queryFn: () => listDocuments("sales")
  });
  const expensesQuery = useQuery({
    queryKey: ["expenses"],
    queryFn: () => listDocuments("expenses")
  });
  const supplierBillsQuery = useQuery({
    queryKey: ["supplierBills"],
    queryFn: () => listDocuments("supplierBills")
  });

  const queryError = salesQuery.error ?? expensesQuery.error ?? supplierBillsQuery.error;

  const metrics = useMemo(() => {
    const sales = (salesQuery.data ?? []).filter((entry) => {
      const date = entry.data.issuedAt.slice(0, 10);
      return date >= dateFrom && date <= dateTo;
    });
    const expenses = (expensesQuery.data ?? []).filter((entry) => {
      const date = entry.data.occurredAt.slice(0, 10);
      return date >= dateFrom && date <= dateTo;
    });
    const bills = supplierBillsQuery.data ?? [];

    const revenueUSD = sales.reduce((sum, entry) => sum + entry.data.totals.totalUSD, 0);
    const revenueVES = sales.reduce((sum, entry) => sum + entry.data.totals.totalVES, 0);
    const collectedUSD = sales.reduce((sum, entry) => sum + entry.data.payment.paidUSD, 0);
    const collectedVES = sales.reduce((sum, entry) => sum + entry.data.payment.paidVES, 0);
    const pendingReceivableUSD = sales.reduce(
      (sum, entry) => sum + entry.data.payment.pendingUSD,
      0
    );
    const pendingReceivableVES = sales.reduce(
      (sum, entry) => sum + entry.data.payment.pendingVES,
      0
    );

    const expensesUSD = expenses.reduce((sum, entry) => sum + entry.data.amountUSD, 0);
    const expensesVES = expenses.reduce((sum, entry) => sum + entry.data.amountVES, 0);

    const payablesUSD = bills.reduce((sum, entry) => sum + entry.data.payment.pendingUSD, 0);
    const payablesVES = bills.reduce((sum, entry) => sum + entry.data.payment.pendingVES, 0);

    const netUSD = revenueUSD - expensesUSD;
    const netVES = revenueVES - expensesVES;

    const cashFlowUSD = collectedUSD - expensesUSD;
    const cashFlowVES = collectedVES - expensesVES;

    return {
      revenueUSD,
      revenueVES,
      collectedUSD,
      collectedVES,
      pendingReceivableUSD,
      pendingReceivableVES,
      expensesUSD,
      expensesVES,
      payablesUSD,
      payablesVES,
      netUSD,
      netVES,
      cashFlowUSD,
      cashFlowVES
    };
  }, [salesQuery.data, expensesQuery.data, supplierBillsQuery.data, dateFrom, dateTo]);

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="relative grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <PageHeader
            eyebrow="Finanzas"
            title="Cuentas y resumen financiero"
            description="Controla ingresos, gastos, cuentas por cobrar y cuentas por pagar en un solo lugar."
          />

          <article className="panel-strong soft-grid reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Periodo</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-[22px] border border-[var(--color-line)] bg-white/82 px-4 py-3 text-sm outline-none"
                onChange={(event) => setDateFrom(event.target.value)}
                type="date"
                value={dateFrom}
              />
              <input
                className="w-full rounded-[22px] border border-[var(--color-line)] bg-white/82 px-4 py-3 text-sm outline-none"
                onChange={(event) => setDateTo(event.target.value)}
                type="date"
                value={dateTo}
              />
            </div>
          </article>
        </div>
      </section>

      {queryError ? (
        <section className="panel-strong reveal rounded-[32px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-danger)]">
            No se pudieron cargar finanzas
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Firestore respondio con error
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            {getFriendlyErrorMessage(queryError)}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          ["Ingresos USD", formatUsd(metrics.revenueUSD)],
          ["Ingresos VES", formatVes(metrics.revenueVES)],
          ["Cobrado USD", formatUsd(metrics.collectedUSD)],
          ["Cobrado VES", formatVes(metrics.collectedVES)]
        ].map(([label, value]) => (
          <article key={label} className="panel-strong rounded-[28px] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">{label}</p>
            <p className="mt-3 font-display text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">CxC</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Pendiente USD</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatUsd(metrics.pendingReceivableUSD)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Pendiente VES</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatVes(metrics.pendingReceivableVES)}
              </span>
            </div>
          </div>
        </article>

        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">CxP</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Pendiente USD</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatUsd(metrics.payablesUSD)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Pendiente VES</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatVes(metrics.payablesVES)}
              </span>
            </div>
          </div>
        </article>

        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Gastos</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">USD</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatUsd(metrics.expensesUSD)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">VES</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatVes(metrics.expensesVES)}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Utilidad</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Neta USD</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatUsd(metrics.netUSD)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Neta VES</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatVes(metrics.netVES)}
              </span>
            </div>
          </div>
        </article>

        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
            Flujo de caja
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">USD</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatUsd(metrics.cashFlowUSD)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">VES</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatVes(metrics.cashFlowVES)}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {[
          {
            to: "/finanzas/proveedores",
            title: "Proveedores",
            description: "Registra proveedores y sus contactos."
          },
          {
            to: "/finanzas/cxp",
            title: "Cuentas por pagar",
            description: "Facturas de proveedores y saldos pendientes."
          },
          {
            to: "/finanzas/gastos",
            title: "Gastos",
            description: "Captura gastos fijos y variables."
          }
        ].map((item) => (
          <Link
            key={item.to}
            className="panel-strong lift-hover rounded-[30px] p-5 sm:p-6"
            to={item.to}
          >
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Acceso rapido
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
              {item.title}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{item.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
