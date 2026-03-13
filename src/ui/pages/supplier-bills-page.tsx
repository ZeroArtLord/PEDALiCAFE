import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/auth-provider.js";
import type { SupplierBill } from "../../domain/types.js";
import { createDocument, getExchangeRate, listDocuments } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

type BillFormState = {
  supplierId: string;
  invoiceNumber: string;
  totalUSD: string;
  totalVES: string;
  paidUSD: string;
  paidVES: string;
  issuedAt: string;
  dueAt: string;
};

const emptyForm: BillFormState = {
  supplierId: "",
  invoiceNumber: "",
  totalUSD: "0",
  totalVES: "0",
  paidUSD: "0",
  paidVES: "0",
  issuedAt: new Date().toISOString().slice(0, 10),
  dueAt: ""
};

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

export function SupplierBillsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<BillFormState>(emptyForm);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => listDocuments("suppliers")
  });

  const billsQuery = useQuery({
    queryKey: ["supplierBills"],
    queryFn: () => listDocuments("supplierBills")
  });

  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });

  const exchangeRate = exchangeRateQuery.data?.rate ?? 0;
  const suppliers = [...(suppliersQuery.data ?? [])].sort((left, right) =>
    left.data.name.localeCompare(right.data.name)
  );
  const bills = [...(billsQuery.data ?? [])].sort((left, right) =>
    right.data.issuedAt.localeCompare(left.data.issuedAt)
  );

  const totals = useMemo(() => {
    return bills.reduce(
      (acc, entry) => {
        acc.pendingUSD += entry.data.payment.pendingUSD;
        acc.pendingVES += entry.data.payment.pendingVES;
        return acc;
      },
      { pendingUSD: 0, pendingVES: 0 }
    );
  }, [bills]);

  const saveBillMutation = useMutation({
    mutationFn: async () => {
      const supplier = suppliers.find((entry) => entry.id === formState.supplierId);

      if (!supplier) {
        throw new Error("Selecciona un proveedor.");
      }

      if (!formState.invoiceNumber.trim()) {
        throw new Error("El numero de factura es obligatorio.");
      }

      const totalUSD = Number(formState.totalUSD) || 0;
      const totalVES = Number(formState.totalVES) || 0;
      const paidUSD = Number(formState.paidUSD) || 0;
      const paidVES = Number(formState.paidVES) || 0;
      const resolvedRate = exchangeRate || 0;

      const normalizedUSD = totalUSD || (resolvedRate ? totalVES / resolvedRate : 0);
      const normalizedVES = totalVES || (resolvedRate ? totalUSD * resolvedRate : 0);

      if (normalizedUSD <= 0 && normalizedVES <= 0) {
        throw new Error("Debes registrar un total.");
      }

      const pendingUSD = Number(Math.max(normalizedUSD - paidUSD, 0).toFixed(2));
      const pendingVES = Number(Math.max(normalizedVES - paidVES, 0).toFixed(2));
      const status: SupplierBill["payment"]["status"] =
        pendingUSD <= 0 && pendingVES <= 0
          ? "paid"
          : paidUSD > 0 || paidVES > 0
            ? "partial"
            : "open";

      const payload: SupplierBill = {
        supplierId: supplier.id,
        supplierSnapshot: {
          name: supplier.data.name,
          phone: supplier.data.phone
        },
        invoiceNumber: formState.invoiceNumber.trim(),
        totals: {
          totalUSD: Number(normalizedUSD.toFixed(2)),
          totalVES: Number(normalizedVES.toFixed(2)),
          exchangeRate: resolvedRate
        },
        payment: {
          status,
          paidUSD: Number(paidUSD.toFixed(2)),
          paidVES: Number(paidVES.toFixed(2)),
          pendingUSD,
          pendingVES
        },
        issuedAt: new Date(formState.issuedAt).toISOString(),
        dueAt: formState.dueAt ? new Date(formState.dueAt).toISOString() : null,
        createdBy: user?.uid ?? "frontend_user"
      };

      await createDocument("supplierBills", `bill_${Date.now()}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["supplierBills"] });
      setFormState(emptyForm);
    }
  });

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <PageHeader
          eyebrow="Cuentas por pagar"
          title="Facturas y obligaciones"
          description="Registra facturas de proveedores y controla el saldo pendiente."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Nueva factura
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
              Registrar CxP
            </h2>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveBillMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Proveedor
              </span>
              <select
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, supplierId: event.target.value }))
                }
                value={formState.supplierId}
              >
                <option value="">Selecciona proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.data.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Factura
              </span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, invoiceNumber: event.target.value }))
                }
                value={formState.invoiceNumber}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Total USD
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, totalUSD: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.totalUSD}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Total VES
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, totalVES: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.totalVES}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Pagado USD
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, paidUSD: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.paidUSD}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Pagado VES
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, paidVES: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.paidVES}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Fecha emision
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, issuedAt: event.target.value }))
                  }
                  type="date"
                  value={formState.issuedAt}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Vence
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, dueAt: event.target.value }))
                  }
                  type="date"
                  value={formState.dueAt}
                />
              </label>
            </div>

            {saveBillMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(saveBillMutation.error)}
              </div>
            ) : null}

            {saveBillMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Factura registrada correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
              disabled={saveBillMutation.isPending}
              type="submit"
            >
              {saveBillMutation.isPending ? "Guardando..." : "Registrar factura"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          <article className="panel-strong rounded-[30px] p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Saldo pendiente
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  USD
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                  {formatUsd(totals.pendingUSD)}
                </p>
              </div>
              <div className="rounded-[22px] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  VES
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                  {formatVes(totals.pendingVES)}
                </p>
              </div>
            </div>
          </article>

          {bills.map((bill) => (
            <article
              key={bill.id}
              className="panel-strong lift-hover reveal rounded-[30px] p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    {bill.data.invoiceNumber}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                    {bill.data.supplierSnapshot.name}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    {new Date(bill.data.issuedAt).toLocaleDateString("es-VE")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    bill.data.payment.status === "paid"
                      ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
                      : bill.data.payment.status === "partial"
                        ? "bg-[var(--color-accent-soft)] text-orange-800"
                        : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                  }`}
                >
                  {bill.data.payment.status}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[var(--color-ink-soft)]">
                <span>Total USD: {formatUsd(bill.data.totals.totalUSD)}</span>
                <span>Pendiente USD: {formatUsd(bill.data.payment.pendingUSD)}</span>
                <span>Total VES: {formatVes(bill.data.totals.totalVES)}</span>
                <span>Pendiente VES: {formatVes(bill.data.payment.pendingVES)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
