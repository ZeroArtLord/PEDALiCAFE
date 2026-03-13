import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/auth-provider.js";
import { buildInvoice, buildInvoiceItem, calculateVesFromUsd } from "../../domain/factories.js";
import type { Customer, ExchangeRateSettings, PaymentMethod, Product } from "../../domain/types.js";
import {
  createInvoiceAndApplyEffects,
  getExchangeRate,
  listDocuments,
  registerPaymentAndApplyEffects
} from "../../lib/firestore.js";
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openPrintWindow(title: string, body: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");

  if (!printWindow) {
    throw new Error("El navegador bloqueo la ventana de impresion.");
  }

  printWindow.document.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; }
          h1, h2, h3, p { margin: 0; }
          .header { margin-bottom: 24px; }
          .muted { color: #6b7280; }
          .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 20px 0; }
          .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          .table th, .table td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; }
          .right { text-align: right; }
          .footer { margin-top: 24px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>${body}</body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function SalesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mixed");
  const [paidUsd, setPaidUsd] = useState("0");
  const [paidVes, setPaidVes] = useState("0");
  const [openPaymentInvoiceId, setOpenPaymentInvoiceId] = useState<string | null>(null);
  const [openDetailInvoiceId, setOpenDetailInvoiceId] = useState<string | null>(null);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [invoiceCustomerFilter, setInvoiceCustomerFilter] = useState("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [paymentDrafts, setPaymentDrafts] = useState<
    Record<string, { amountUSD: string; amountVES: string; method: PaymentMethod }>
  >({});

  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listDocuments("invoices")
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments"],
    queryFn: () => listDocuments("payments")
  });

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listDocuments("customers")
  });

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => listDocuments("products")
  });

  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });

  const invoices = [...(invoicesQuery.data ?? [])]
    .sort((left, right) => right.data.issuedAt.localeCompare(left.data.issuedAt))
    .map(({ id, data }) => ({
      id,
      customerId: data.customerId,
      number: data.invoiceNumber,
      customer: data.customerSnapshot.fullName,
      phone: data.customerSnapshot.phone,
      issuedAt: data.issuedAt,
      totalUsd: data.totals.totalUSD,
      totalVes: data.totals.totalVES,
      items: data.items,
      paidUsd: data.payment.paidUSD,
      paidVes: data.payment.paidVES,
      paidLabel:
        data.payment.paidUSD > 0 || data.payment.paidVES > 0
          ? `${formatUsd(data.payment.paidUSD)} + ${formatVes(data.payment.paidVES)}`
          : formatUsd(0),
      pendingUsd: data.payment.pendingUSD,
      pendingVes: data.payment.pendingVES,
      status:
        data.payment.status === "paid"
          ? "Pagada"
          : data.payment.status === "partial"
            ? "Pendiente parcial"
            : "Por cobrar",
      paymentProgress:
        data.totals.totalUSD > 0
          ? Math.min(
              Math.round(
                ((data.totals.totalUSD - data.payment.pendingUSD) / data.totals.totalUSD) * 100
              ),
              100
            )
          : 0,
      method: data.payment.method
    }));
  const paymentsByInvoice = (paymentsQuery.data ?? []).reduce<Record<string, Array<{ id: string; amountUSD: number; amountVES: number; receivedAt: string; method: PaymentMethod }>>>(
    (accumulator, entry) => {
      const list = accumulator[entry.data.invoiceId] ?? [];
      list.push({
        id: entry.id,
        amountUSD: entry.data.amountUSD,
        amountVES: entry.data.amountVES,
        receivedAt: entry.data.receivedAt,
        method: entry.data.method
      });
      accumulator[entry.data.invoiceId] = list;
      return accumulator;
    },
    {}
  );
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesStatus =
      invoiceStatusFilter === "all" ||
      (invoiceStatusFilter === "paid" && invoice.status === "Pagada") ||
      (invoiceStatusFilter === "partial" && invoice.status === "Pendiente parcial") ||
      (invoiceStatusFilter === "pending" && invoice.status === "Por cobrar");
    const matchesCustomer =
      invoiceCustomerFilter === "all" || invoice.customerId === invoiceCustomerFilter;
    const searchValue = invoiceSearch.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      invoice.number.toLowerCase().includes(searchValue) ||
      invoice.customer.toLowerCase().includes(searchValue);

    return matchesStatus && matchesCustomer && matchesSearch;
  });

  const customers = [...(customersQuery.data ?? [])].sort((a, b) =>
    a.data.fullName.localeCompare(b.data.fullName)
  );
  const products = [...(productsQuery.data ?? [])].sort((a, b) =>
    a.data.name.localeCompare(b.data.name)
  );
  const exchangeRate = exchangeRateQuery.data;

  const selectedCustomer = useMemo(
    () =>
      customers.find((entry) => entry.id === selectedCustomerId) ??
      customers[0] ??
      null,
    [customers, selectedCustomerId]
  );

  const selectedProduct = useMemo(
    () =>
      products.find((entry) => entry.id === selectedProductId) ??
      products[0] ??
      null,
    [products, selectedProductId]
  );

  const quantityValue = Number(quantity) || 0;
  const paidUsdValue = Number(paidUsd) || 0;
  const paidVesValue = Number(paidVes) || 0;
  const subtotalUsd =
    selectedProduct && quantityValue > 0
      ? Number((selectedProduct.data.price.saleUSD * quantityValue).toFixed(2))
      : 0;
  const subtotalVes = exchangeRate ? calculateVesFromUsd(subtotalUsd, exchangeRate.rate) : 0;
  const pendingUsdPreview = Math.max(subtotalUsd - paidUsdValue, 0);
  const pendingVesPreview = Math.max(subtotalVes - paidVesValue, 0);

  const totalBilledUsd = invoices.reduce((sum, invoice) => sum + invoice.totalUsd, 0);
  const totalPendingUsd = invoices.reduce((sum, invoice) => sum + invoice.pendingUsd, 0);
  const recoveredUsd = totalBilledUsd - totalPendingUsd;
  const paymentsCount = paymentsQuery.data?.length ?? 0;
  const queryError =
    invoicesQuery.error ??
    paymentsQuery.error ??
    customersQuery.error ??
    productsQuery.error ??
    exchangeRateQuery.error;

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer || !selectedProduct || !exchangeRate) {
        throw new Error("Debes seleccionar cliente, producto y tener una tasa activa.");
      }

      if (quantityValue <= 0) {
        throw new Error("La cantidad debe ser mayor que cero.");
      }

      if (selectedProduct.data.stock.available < quantityValue) {
        throw new Error("No hay stock disponible suficiente para esta venta.");
      }

      const timestamp = new Date();
      const issuedAt = timestamp.toISOString();
      const suffix = timestamp.getTime().toString().slice(-4);
      const invoiceId = `invoice_${timestamp.getTime()}`;
      const paymentId =
        paidUsdValue > 0 || paidVesValue > 0 ? `payment_${timestamp.getTime()}` : undefined;
      const stockMovementId = `movement_${timestamp.getTime()}`;
      const invoiceNumber = `FV-${issuedAt.slice(0, 10).replaceAll("-", "")}-${suffix}`;

      const invoiceItem = buildInvoiceItem({
        productId: selectedProduct.id,
        sku: selectedProduct.data.sku,
        name: selectedProduct.data.name,
        quantity: quantityValue,
        unitPriceUSD: selectedProduct.data.price.saleUSD,
        exchangeRate: exchangeRate.rate
      });

      const invoice = buildInvoice({
        invoiceNumber,
        customerDocumentId: selectedCustomer.id,
        customer: selectedCustomer.data as Customer,
        items: [invoiceItem],
        saleType: pendingUsdPreview > 0 || pendingVesPreview > 0 ? "credit" : "cash",
        paymentMethod,
        paidUSD: paidUsdValue,
        paidVES: paidVesValue,
        exchangeRate: exchangeRate as ExchangeRateSettings,
        createdBy: user?.uid ?? "frontend_user",
        issuedAt
      });

      await createInvoiceAndApplyEffects({
        invoiceId,
        paymentId,
        stockMovementId,
        customerDocumentId: selectedCustomer.id,
        productDocumentId: selectedProduct.id,
        invoice,
        quantitySold: quantityValue,
        createdBy: user?.uid ?? "frontend_user",
        createdAt: issuedAt
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] })
      ]);
      setQuantity("1");
      setPaidUsd("0");
      setPaidVes("0");
    }
  });

  const registerPaymentMutation = useMutation({
    mutationFn: async (invoice: { id: string; customerId: string; pendingUsd: number }) => {
      if (!exchangeRate) {
        throw new Error("No hay una tasa activa para registrar el pago.");
      }

      const draft = paymentDrafts[invoice.id] ?? {
        amountUSD: "0",
        amountVES: "0",
        method: "mixed" as PaymentMethod
      };
      const amountUSD = Number(draft.amountUSD) || 0;
      const amountVES = Number(draft.amountVES) || 0;
      const effectiveUsd = Number((amountUSD + amountVES / exchangeRate.rate).toFixed(2));

      if (amountUSD <= 0 && amountVES <= 0) {
        throw new Error("Debes indicar un monto para el abono.");
      }

      if (effectiveUsd - invoice.pendingUsd > 0.01) {
        throw new Error("El abono supera el saldo pendiente de la factura.");
      }

      const receivedAt = new Date().toISOString();

      await registerPaymentAndApplyEffects({
        paymentId: `payment_${Date.now()}`,
        invoiceDocumentId: invoice.id,
        customerDocumentId: invoice.customerId,
        amountUSD,
        amountVES,
        exchangeRate: exchangeRate.rate,
        paymentMethod: draft.method,
        receivedBy: user?.uid ?? "frontend_user",
        receivedAt
      });
    },
    onSuccess: async (_, invoice) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] })
      ]);

      setPaymentDrafts((current) => ({
        ...current,
        [invoice.id]: { amountUSD: "0", amountVES: "0", method: "mixed" }
      }));
      setOpenPaymentInvoiceId(null);
    }
  });

  function getPaymentDraft(invoiceId: string) {
    return (
      paymentDrafts[invoiceId] ?? {
        amountUSD: "0",
        amountVES: "0",
        method: "mixed" as PaymentMethod
      }
    );
  }

  function updatePaymentDraft(
    invoiceId: string,
    patch: Partial<{ amountUSD: string; amountVES: string; method: PaymentMethod }>
  ) {
    setPaymentDrafts((current) => ({
      ...current,
      [invoiceId]: {
        ...getPaymentDraft(invoiceId),
        ...patch
      }
    }));
  }

  function printInvoice(invoiceId: string) {
    const invoice = invoices.find((entry) => entry.id === invoiceId);

    if (!invoice) {
      return;
    }

    const itemRows = invoice.items
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.quantity} Kg</td>
          <td class="right">${escapeHtml(formatUsd(item.unitPriceUSD))}</td>
          <td class="right">${escapeHtml(formatUsd(item.subtotalUSD))}</td>
        </tr>`
      )
      .join("");

    openPrintWindow(
      `Factura ${invoice.number}`,
      `<div class="header">
        <h1>Factura ${escapeHtml(invoice.number)}</h1>
        <p class="muted">Cliente: ${escapeHtml(invoice.customer)}</p>
        <p class="muted">Telefono: ${escapeHtml(invoice.phone)}</p>
        <p class="muted">Fecha: ${escapeHtml(new Date(invoice.issuedAt).toLocaleString("es-VE"))}</p>
      </div>
      <div class="grid">
        <div class="card"><p class="muted">Total USD</p><h2>${escapeHtml(formatUsd(invoice.totalUsd))}</h2></div>
        <div class="card"><p class="muted">Total VES</p><h2>${escapeHtml(formatVes(invoice.totalVes))}</h2></div>
        <div class="card"><p class="muted">Abonado</p><h2>${escapeHtml(`${formatUsd(invoice.paidUsd)} + ${formatVes(invoice.paidVes)}`)}</h2></div>
        <div class="card"><p class="muted">Saldo</p><h2>${escapeHtml(formatUsd(invoice.pendingUsd))}</h2></div>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th class="right">Precio</th>
            <th class="right">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p class="footer">Metodo: ${escapeHtml(invoice.method)} - Estado: ${escapeHtml(invoice.status)}</p>`
    );
  }

  function printReceipt(invoiceId: string) {
    const invoice = invoices.find((entry) => entry.id === invoiceId);
    const payments = paymentsByInvoice[invoiceId] ?? [];

    if (!invoice) {
      return;
    }

    const paymentRows = payments.length
      ? payments
          .map(
            (payment) => `<tr>
              <td>${escapeHtml(new Date(payment.receivedAt).toLocaleString("es-VE"))}</td>
              <td>${escapeHtml(payment.method)}</td>
              <td class="right">${escapeHtml(formatUsd(payment.amountUSD))}</td>
              <td class="right">${escapeHtml(formatVes(payment.amountVES))}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="4">No hay pagos registrados para esta factura.</td></tr>`;

    openPrintWindow(
      `Comprobante ${invoice.number}`,
      `<div class="header">
        <h1>Comprobante de pago</h1>
        <p class="muted">Factura: ${escapeHtml(invoice.number)}</p>
        <p class="muted">Cliente: ${escapeHtml(invoice.customer)}</p>
      </div>
      <div class="grid">
        <div class="card"><p class="muted">Total factura</p><h2>${escapeHtml(formatUsd(invoice.totalUsd))}</h2></div>
        <div class="card"><p class="muted">Pagado acumulado</p><h2>${escapeHtml(`${formatUsd(invoice.paidUsd)} + ${formatVes(invoice.paidVes)}`)}</h2></div>
        <div class="card"><p class="muted">Saldo USD</p><h2>${escapeHtml(formatUsd(invoice.pendingUsd))}</h2></div>
        <div class="card"><p class="muted">Saldo VES</p><h2>${escapeHtml(formatVes(invoice.pendingVes))}</h2></div>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Metodo</th>
            <th class="right">USD</th>
            <th class="right">VES</th>
          </tr>
        </thead>
        <tbody>${paymentRows}</tbody>
      </table>
      <p class="footer">Documento generado desde PEDALiCAFE.</p>`
    );
  }

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="floating-orb right-[-12px] top-8 h-20 w-20 bg-[rgba(200,74,52,0.12)]" />
        <div className="relative grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <PageHeader
              eyebrow="Ventas"
              title="Caja, facturas y cobranza en una sola vista"
              description="Ahora puedes registrar ventas reales desde esta pantalla, descontar stock y crear cuentas por cobrar con pagos mixtos USD/VES."
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: "Facturado",
                  value: formatUsd(totalBilledUsd),
                  tone: "bg-[var(--color-brand)] text-white"
                },
                {
                  label: "Recuperado",
                  value: formatUsd(recoveredUsd),
                  tone: "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
                },
                {
                  label: "Por cobrar",
                  value: formatUsd(totalPendingUsd),
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

          <article className="panel-strong soft-grid reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Pulso de cobranza
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
              Recuperacion de cartera
            </h2>
            <div className="mt-5 space-y-4">
              {[
                [
                  "Cobro del dia",
                  totalBilledUsd > 0 ? `${Math.round((recoveredUsd / totalBilledUsd) * 100)}%` : "0%",
                  totalBilledUsd > 0 ? Math.min(Math.round((recoveredUsd / totalBilledUsd) * 100), 100) : 0
                ],
                ["Facturas activas", `${filteredInvoices.length}`, Math.min(filteredInvoices.length * 40, 100)],
                ["Pagos registrados", `${paymentsCount}`, Math.min(paymentsCount * 30, 100)]
              ].map(([label, value, progress]) => (
                <div key={label} className="rounded-[24px] bg-white/80 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-[var(--color-ink-soft)]">{label}</p>
                    <span className="text-sm font-semibold text-[var(--color-ink)]">{value}</span>
                  </div>
                  <div className="progress-rail mt-3">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      {queryError ? (
        <section className="panel-strong reveal rounded-[32px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-danger)]">
            No se pudieron cargar las ventas
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Firestore respondio con error
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            {getFriendlyErrorMessage(queryError)}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Nueva factura
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                Registrar venta
              </h2>
            </div>
            <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-deep)]">
              Caja
            </span>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createInvoiceMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Cliente</span>
              <select
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                onChange={(event) => setSelectedCustomerId(event.target.value)}
                value={selectedCustomer?.id ?? ""}
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.data.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Producto</span>
              <select
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                onChange={(event) => setSelectedProductId(event.target.value)}
                value={selectedProduct?.id ?? ""}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.data.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Cantidad</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  min="1"
                  onChange={(event) => setQuantity(event.target.value)}
                  step="1"
                  type="number"
                  value={quantity}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Metodo</span>
                <select
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  value={paymentMethod}
                >
                  <option value="mixed">Mixto</option>
                  <option value="cash_usd">Efectivo USD</option>
                  <option value="cash_ves">Efectivo VES</option>
                  <option value="transfer_ves">Transferencia VES</option>
                  <option value="zelle">Zelle</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Abono USD</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  min="0"
                  onChange={(event) => setPaidUsd(event.target.value)}
                  step="0.01"
                  type="number"
                  value={paidUsd}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Abono VES</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  min="0"
                  onChange={(event) => setPaidVes(event.target.value)}
                  step="0.01"
                  type="number"
                  value={paidVes}
                />
              </label>
            </div>

            {createInvoiceMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(createInvoiceMutation.error)}
              </div>
            ) : null}

            {createInvoiceMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Venta registrada correctamente. Se desconto inventario y se actualizo la cuenta del cliente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(10,67,52,0.24)] transition hover:bg-[var(--color-brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                createInvoiceMutation.isPending ||
                !selectedCustomer ||
                !selectedProduct ||
                !exchangeRate ||
                quantityValue <= 0
              }
              type="submit"
            >
              {createInvoiceMutation.isPending ? "Guardando venta..." : "Registrar venta"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          <article className="panel-strong reveal reveal-delay-2 rounded-[30px] p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Vista previa</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Total USD</p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                  {formatUsd(subtotalUsd)}
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Total VES</p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                  {formatVes(subtotalVes)}
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Pendiente USD</p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-danger)]">
                  {formatUsd(pendingUsdPreview)}
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Pendiente VES</p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-danger)]">
                  {formatVes(pendingVesPreview)}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-[26px] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,246,235,0.85))] px-4 py-4 ring-1 ring-[var(--color-line)]">
              <p className="text-sm text-[var(--color-ink-soft)]">
                Cliente: <span className="font-semibold text-[var(--color-ink)]">{selectedCustomer?.data.fullName ?? "--"}</span>
              </p>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                Producto: <span className="font-semibold text-[var(--color-ink)]">{selectedProduct?.data.name ?? "--"}</span>
              </p>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                Stock disponible: <span className="font-semibold text-[var(--color-ink)]">{selectedProduct?.data.stock.available ?? 0} Kg</span>
              </p>
            </div>
          </article>

          <section className="space-y-3">
            <article className="panel-strong reveal reveal-delay-2 rounded-[30px] p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
                    Buscar
                  </span>
                  <input
                    className="w-full rounded-[22px] border border-[var(--color-line)] bg-white/82 px-4 py-3 text-sm outline-none"
                    onChange={(event) => setInvoiceSearch(event.target.value)}
                    placeholder="Factura o cliente"
                    value={invoiceSearch}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
                    Cliente
                  </span>
                  <select
                    className="w-full rounded-[22px] border border-[var(--color-line)] bg-white/82 px-4 py-3 text-sm outline-none"
                    onChange={(event) => setInvoiceCustomerFilter(event.target.value)}
                    value={invoiceCustomerFilter}
                  >
                    <option value="all">Todos</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.data.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
                    Estado
                  </span>
                  <select
                    className="w-full rounded-[22px] border border-[var(--color-line)] bg-white/82 px-4 py-3 text-sm outline-none"
                    onChange={(event) => setInvoiceStatusFilter(event.target.value)}
                    value={invoiceStatusFilter}
                  >
                    <option value="all">Todos</option>
                    <option value="pending">Por cobrar</option>
                    <option value="partial">Pendiente parcial</option>
                    <option value="paid">Pagada</option>
                  </select>
                </label>
              </div>
            </article>

            {filteredInvoices.map((invoice) => (
              <article
                key={invoice.id}
                className="panel-strong lift-hover reveal reveal-delay-2 rounded-[32px] p-5 sm:p-6"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                        {invoice.number}
                      </p>
                      <h2 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                        {invoice.customer}
                      </h2>
                      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{invoice.method}</p>
                    </div>
                    <span className="rounded-full bg-[var(--color-accent-soft)] px-3 py-2 text-xs font-semibold text-orange-800">
                      {invoice.status}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    Emitida: {new Date(invoice.issuedAt).toLocaleString("es-VE")}
                  </p>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Total</p>
                      <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                        {formatUsd(invoice.totalUsd)}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                        {formatVes(invoice.totalVes)}
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Abonado</p>
                      <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                        {invoice.paidLabel}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Pago registrado en caja</p>
                    </div>
                    <div className="rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Saldo</p>
                      <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-danger)]">
                        {formatUsd(invoice.pendingUsd)}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                        {formatVes(invoice.pendingVes)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[26px] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,246,235,0.85))] px-4 py-4 ring-1 ring-[var(--color-line)]">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm text-[var(--color-ink-soft)]">Progreso de cobro</p>
                      <span className="text-sm font-semibold text-[var(--color-ink)]">
                        {invoice.paymentProgress}%
                      </span>
                    </div>
                    <div className="progress-rail mt-3">
                      <div className="progress-fill" style={{ width: `${invoice.paymentProgress}%` }} />
                    </div>
                  </div>

                  <button
                    className="rounded-[24px] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white"
                    onClick={() =>
                      setOpenDetailInvoiceId((current) => (current === invoice.id ? null : invoice.id))
                    }
                    type="button"
                  >
                    {openDetailInvoiceId === invoice.id ? "Ocultar detalle" : "Ver detalle"}
                  </button>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-brand-deep)] transition hover:bg-[var(--color-brand)] hover:text-white"
                      onClick={() => printInvoice(invoice.id)}
                      type="button"
                    >
                      Imprimir factura
                    </button>
                    <button
                      className="rounded-[24px] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white"
                      onClick={() => printReceipt(invoice.id)}
                      type="button"
                    >
                      Comprobante de pago
                    </button>
                  </div>

                  {openDetailInvoiceId === invoice.id ? (
                    <div className="rounded-[26px] border border-[var(--color-line)] bg-white/85 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">
                        Items de la factura
                      </p>
                      <div className="mt-4 space-y-3">
                        {invoice.items.map((item) => (
                          <div
                            key={`${invoice.id}-${item.productId}`}
                            className="rounded-[22px] bg-[var(--color-surface)] px-4 py-4"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
                                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                                  {item.quantity} Kg - {item.sku}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-[var(--color-ink)]">
                                  {formatUsd(item.subtotalUSD)}
                                </p>
                                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                                  {formatVes(item.subtotalVES)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {invoice.pendingUsd > 0 || invoice.pendingVes > 0 ? (
                    <div className="rounded-[26px] border border-[var(--color-line)] bg-white/85 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">
                            Cobranza
                          </p>
                          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                            Registra un abono y actualiza esta cuenta por cobrar.
                          </p>
                        </div>
                        <button
                          className="rounded-full bg-[var(--color-brand-soft)] px-4 py-2 text-xs font-semibold text-[var(--color-brand-deep)] transition hover:bg-[var(--color-brand)] hover:text-white"
                          onClick={() =>
                            setOpenPaymentInvoiceId((current) =>
                              current === invoice.id ? null : invoice.id
                            )
                          }
                          type="button"
                        >
                          {openPaymentInvoiceId === invoice.id ? "Ocultar" : "Registrar pago"}
                        </button>
                      </div>

                      {openPaymentInvoiceId === invoice.id ? (
                        <form
                          className="mt-4 space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void registerPaymentMutation.mutateAsync({
                              id: invoice.id,
                              customerId: invoice.customerId,
                              pendingUsd: invoice.pendingUsd
                            });
                          }}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                                Abono USD
                              </span>
                              <input
                                className="w-full rounded-[22px] border border-[var(--color-line)] bg-white px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                                min="0"
                                onChange={(event) =>
                                  updatePaymentDraft(invoice.id, { amountUSD: event.target.value })
                                }
                                step="0.01"
                                type="number"
                                value={getPaymentDraft(invoice.id).amountUSD}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                                Abono VES
                              </span>
                              <input
                                className="w-full rounded-[22px] border border-[var(--color-line)] bg-white px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                                min="0"
                                onChange={(event) =>
                                  updatePaymentDraft(invoice.id, { amountVES: event.target.value })
                                }
                                step="0.01"
                                type="number"
                                value={getPaymentDraft(invoice.id).amountVES}
                              />
                            </label>
                          </div>

                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                              Metodo de cobro
                            </span>
                            <select
                              className="w-full rounded-[22px] border border-[var(--color-line)] bg-white px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                              onChange={(event) =>
                                updatePaymentDraft(invoice.id, {
                                  method: event.target.value as PaymentMethod
                                })
                              }
                              value={getPaymentDraft(invoice.id).method}
                            >
                              <option value="mixed">Mixto</option>
                              <option value="cash_usd">Efectivo USD</option>
                              <option value="cash_ves">Efectivo VES</option>
                              <option value="transfer_ves">Transferencia VES</option>
                              <option value="zelle">Zelle</option>
                            </select>
                          </label>

                          {registerPaymentMutation.isError &&
                          openPaymentInvoiceId === invoice.id ? (
                            <div className="rounded-[22px] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
                              {getFriendlyErrorMessage(registerPaymentMutation.error)}
                            </div>
                          ) : null}

                          <button
                            className="inline-flex w-full items-center justify-center rounded-[24px] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={registerPaymentMutation.isPending}
                            type="submit"
                          >
                            {registerPaymentMutation.isPending &&
                            openPaymentInvoiceId === invoice.id
                              ? "Registrando pago..."
                              : "Guardar abono"}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}
