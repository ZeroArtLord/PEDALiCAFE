import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { getExchangeRate, listDocuments } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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

function calculateProgress(value: number, reference: number) {
  if (reference <= 0) {
    return 0;
  }

  return Math.min(Math.round((value / reference) * 100), 100);
}

export function DashboardPage() {
  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listDocuments("invoices")
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments"],
    queryFn: () => listDocuments("payments")
  });

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => listDocuments("products")
  });

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listDocuments("customers")
  });

  const batchesQuery = useQuery({
    queryKey: ["productionBatches"],
    queryFn: () => listDocuments("productionBatches")
  });

  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });

  const queryError =
    invoicesQuery.error ??
    paymentsQuery.error ??
    productsQuery.error ??
    customersQuery.error ??
    batchesQuery.error ??
    exchangeRateQuery.error;

  const isLoading =
    invoicesQuery.isLoading ||
    paymentsQuery.isLoading ||
    productsQuery.isLoading ||
    customersQuery.isLoading ||
    batchesQuery.isLoading ||
    exchangeRateQuery.isLoading;

  const metrics = useMemo(() => {
    const invoices = invoicesQuery.data ?? [];
    const payments = paymentsQuery.data ?? [];
    const products = productsQuery.data ?? [];
    const customers = customersQuery.data ?? [];
    const batches = batchesQuery.data ?? [];
    const today = new Date().toISOString().slice(0, 10);

    const invoicesToday = invoices.filter((entry) => entry.data.issuedAt.startsWith(today));
    const paymentsToday = payments.filter((entry) => entry.data.receivedAt.startsWith(today));
    const batchesToday = batches.filter((entry) => entry.data.dates.productionDate.startsWith(today));

    const salesTodayUsd = invoicesToday.reduce((sum, entry) => sum + entry.data.totals.totalUSD, 0);
    const activeReceivableUsd = invoices.reduce((sum, entry) => sum + entry.data.payment.pendingUSD, 0);
    const recoveredTodayUsd = paymentsToday.reduce((sum, entry) => sum + entry.data.amountUSD, 0);
    const producedTodayKg = batchesToday.reduce((sum, entry) => sum + entry.data.output.netPulpKg, 0);
    const totalAvailableKg = products.reduce((sum, entry) => sum + entry.data.stock.available, 0);
    const criticalProducts = products.filter(
      (entry) => entry.data.status === "active" && entry.data.stock.current <= entry.data.stock.minimum
    ).length;
    const customersWithDebt = customers.filter((entry) => entry.data.credit.pendingDebtUSD > 0).length;
    const lowStockProducts = products
      .filter((entry) => entry.data.status === "active" && entry.data.stock.current <= entry.data.stock.minimum)
      .sort((left, right) => left.data.stock.current - right.data.stock.current)
      .slice(0, 3)
      .map((entry) => ({
        id: entry.id,
        name: entry.data.name,
        current: entry.data.stock.current,
        minimum: entry.data.stock.minimum
      }));
    const recentBatches = [...batches]
      .sort((left, right) => right.data.dates.productionDate.localeCompare(left.data.dates.productionDate))
      .slice(0, 3)
      .map((entry) => ({
        id: entry.id,
        number: entry.data.batchNumber,
        product: entry.data.productNameSnapshot,
        outputKg: entry.data.output.netPulpKg,
        wastePercent: entry.data.output.lossPercent
      }));
    const recentInvoices = [...invoices]
      .sort((left, right) => right.data.issuedAt.localeCompare(left.data.issuedAt))
      .slice(0, 3)
      .map((entry) => ({
        id: entry.id,
        number: entry.data.invoiceNumber,
        customer: entry.data.customerSnapshot.fullName,
        totalUsd: entry.data.totals.totalUSD,
        pendingUsd: entry.data.payment.pendingUSD
      }));
    const totalBilledUsd = invoices.reduce((sum, entry) => sum + entry.data.totals.totalUSD, 0);

    return {
      salesTodayUsd,
      activeReceivableUsd,
      recoveredTodayUsd,
      producedTodayKg,
      totalAvailableKg,
      criticalProducts,
      customersWithDebt,
      totalBilledUsd,
      lowStockProducts,
      recentBatches,
      recentInvoices
    };
  }, [
    batchesQuery.data,
    customersQuery.data,
    invoicesQuery.data,
    paymentsQuery.data,
    productsQuery.data
  ]);

  const exchangeRate = exchangeRateQuery.data?.rate ?? 0;
  const collectionStates = [
    [
      "Firestore",
      queryError ? "Con error" : "Conectado",
      queryError ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
    ],
    [
      "Facturas",
      `${invoicesQuery.data?.length ?? 0} docs`,
      "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
    ],
    [
      "Lotes",
      `${batchesQuery.data?.length ?? 0} docs`,
      "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
    ],
    [
      "Productos criticos",
      `${metrics.criticalProducts}`,
      metrics.criticalProducts > 0
        ? "bg-[var(--color-accent-soft)] text-orange-800"
        : "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
    ]
  ] as const;

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="floating-orb right-[-18px] top-12 h-24 w-24 bg-[rgba(19,105,79,0.16)]" />
        <div className="floating-orb bottom-6 left-[-12px] h-20 w-20 bg-[rgba(243,143,41,0.14)]" />
        <div className="relative grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div>
            <PageHeader
              eyebrow="Centro de control"
              title="Operacion diaria con foco comercial"
              description="La portada ya consume ventas, cobranza, produccion, inventario y clientes reales desde Firestore."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Ventas hoy", value: formatUsd(metrics.salesTodayUsd), tone: "bg-[var(--color-brand)] text-white" },
                {
                  label: "Tasa USD/VES",
                  value: exchangeRate > 0 ? exchangeRate.toFixed(2) : "--",
                  tone: "bg-[var(--color-accent-soft)] text-orange-800"
                },
                {
                  label: "CxC activa",
                  value: formatUsd(metrics.activeReceivableUsd),
                  tone: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                }
              ].map((item, index) => (
                <div
                  key={item.label}
                  className={`reveal rounded-[26px] px-4 py-4 ${item.tone} reveal-delay-${index + 1}`}
                >
                  <p className="text-[11px] uppercase tracking-[0.24em] opacity-75">{item.label}</p>
                  <p className="mt-3 font-display text-3xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-strong soft-grid reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Pulso del dia
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
              {metrics.criticalProducts > 0 ? "Hay focos que revisar hoy" : "La operacion esta saludable"}
            </h2>
            <div className="mt-5 space-y-4">
              {[
                [
                  "Produccion completada",
                  `${metrics.producedTodayKg.toFixed(2)} Kg netos`,
                  calculateProgress(metrics.producedTodayKg, 100)
                ],
                [
                  "Inventario disponible",
                  `${metrics.totalAvailableKg.toFixed(2)} Kg listos`,
                  calculateProgress(metrics.totalAvailableKg, 150)
                ],
                [
                  "Cobranza del dia",
                  formatUsd(metrics.recoveredTodayUsd),
                  calculateProgress(metrics.recoveredTodayUsd, Math.max(metrics.salesTodayUsd, 1))
                ]
              ].map(([label, value, percent]) => (
                <div key={label} className="rounded-[24px] bg-white/80 px-4 py-4 backdrop-blur">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-[var(--color-ink-soft)]">{label}</p>
                    <span className="text-sm font-semibold text-[var(--color-ink)]">{value}</span>
                  </div>
                  <div className="progress-rail mt-3">
                    <div className="progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {queryError ? (
        <section className="panel-strong reveal rounded-[32px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-danger)]">
            No se pudo cargar el dashboard
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Firestore respondio con error
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            {getFriendlyErrorMessage(queryError)}
          </p>
        </section>
      ) : null}

      {isLoading ? (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="panel-strong rounded-[30px] p-5 sm:p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-44 rounded-full bg-slate-200/80" />
              <div className="h-28 rounded-[24px] bg-slate-200/70" />
              <div className="h-24 rounded-[24px] bg-slate-200/70" />
            </div>
          </article>
          <article className="panel-strong rounded-[30px] p-5 sm:p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-36 rounded-full bg-slate-200/80" />
              <div className="h-16 rounded-[22px] bg-slate-200/70" />
              <div className="h-16 rounded-[22px] bg-slate-200/70" />
            </div>
          </article>
        </section>
      ) : null}

      {!isLoading && !queryError ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    Resumen real
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                    Indicadores operativos
                  </h2>
                </div>
                <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-deep)]">
                  Live
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Facturado acumulado", formatUsd(metrics.totalBilledUsd)],
                  ["Cobrado hoy", formatUsd(metrics.recoveredTodayUsd)],
                  ["Clientes con deuda", `${metrics.customersWithDebt}`],
                  ["Productos criticos", `${metrics.criticalProducts}`]
                ].map(([title, value], index) => (
                  <div
                    key={title}
                    className={`lift-hover rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4 reveal reveal-delay-${index}`}
                  >
                    <p className="text-sm text-[var(--color-ink-soft)]">{title}</p>
                    <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(245,255,249,0.85))] px-4 py-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                  Alertas de inventario
                </p>
                <div className="mt-4 space-y-3">
                  {metrics.lowStockProducts.length ? (
                    metrics.lowStockProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-4 rounded-[22px] bg-white/85 px-4 py-4"
                      >
                        <div>
                          <p className="font-semibold text-[var(--color-ink)]">{product.name}</p>
                          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                            {product.current} Kg actuales · minimo {product.minimum} Kg
                          </p>
                        </div>
                        <span className="rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold text-orange-800">
                          Reponer
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[22px] bg-white/85 px-4 py-4 text-sm text-[var(--color-ink-soft)]">
                      No hay productos criticos en este momento.
                    </div>
                  )}
                </div>
              </div>
            </article>

            <article className="glass-card reveal reveal-delay-2 rounded-[30px] p-5 sm:p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Estado tecnico</p>
              <div className="mt-4 space-y-3">
                {collectionStates.map(([label, value, tone]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 rounded-[22px] border border-[var(--color-line)] bg-white/78 px-4 py-4"
                  >
                    <span className="text-sm text-[var(--color-ink-soft)]">{label}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{value}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    Produccion reciente
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                    Ultimos lotes
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {metrics.recentBatches.length ? (
                  metrics.recentBatches.map((batch) => (
                    <div
                      key={batch.id}
                      className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[var(--color-ink)]">{batch.product}</p>
                          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{batch.number}</p>
                        </div>
                        <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-deep)]">
                          {batch.outputKg} Kg
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                        Merma reportada: {batch.wastePercent.toFixed(2)}%
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4 text-sm text-[var(--color-ink-soft)]">
                    Todavia no hay lotes registrados.
                  </div>
                )}
              </div>
            </article>

            <article className="panel-strong reveal reveal-delay-2 rounded-[30px] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    Facturacion reciente
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                    Ultimas ventas
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {metrics.recentInvoices.length ? (
                  metrics.recentInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[var(--color-ink)]">{invoice.customer}</p>
                          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{invoice.number}</p>
                        </div>
                        <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-deep)]">
                          {formatUsd(invoice.totalUsd)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                        Saldo pendiente: {formatUsd(invoice.pendingUsd)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4 text-sm text-[var(--color-ink-soft)]">
                    Todavia no hay facturas registradas.
                  </div>
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
