import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/auth-provider.js";
import type { Expense } from "../../domain/types.js";
import { createDocument, getExchangeRate, listDocuments } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

type ExpenseFormState = {
  label: string;
  category: Expense["category"];
  amountUSD: string;
  amountVES: string;
  paymentMethod: Expense["paymentMethod"];
  occurredAt: string;
  notes: string;
};

const emptyForm: ExpenseFormState = {
  label: "",
  category: "variable",
  amountUSD: "0",
  amountVES: "0",
  paymentMethod: "cash_ves",
  occurredAt: new Date().toISOString().slice(0, 10),
  notes: ""
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

export function ExpensesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<ExpenseFormState>(emptyForm);

  const expensesQuery = useQuery({
    queryKey: ["expenses"],
    queryFn: () => listDocuments("expenses")
  });
  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });

  const exchangeRate = exchangeRateQuery.data?.rate ?? 0;
  const expenses = [...(expensesQuery.data ?? [])].sort((left, right) =>
    right.data.occurredAt.localeCompare(left.data.occurredAt)
  );

  const totals = useMemo(() => {
    return expenses.reduce(
      (acc, entry) => {
        acc.usd += entry.data.amountUSD;
        acc.ves += entry.data.amountVES;
        return acc;
      },
      { usd: 0, ves: 0 }
    );
  }, [expenses]);

  const saveExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!formState.label.trim()) {
        throw new Error("La descripcion del gasto es obligatoria.");
      }

      const amountUSD = Number(formState.amountUSD) || 0;
      const amountVES = Number(formState.amountVES) || 0;

      const resolvedRate = exchangeRate || 0;
      const normalizedUSD = amountUSD || (resolvedRate ? amountVES / resolvedRate : 0);
      const normalizedVES = amountVES || (resolvedRate ? amountUSD * resolvedRate : 0);

      if (normalizedUSD <= 0 && normalizedVES <= 0) {
        throw new Error("Debes registrar un monto en USD o VES.");
      }

      const occurredAtIso = new Date(formState.occurredAt).toISOString();

      const payload: Expense = {
        label: formState.label.trim(),
        category: formState.category,
        amountUSD: Number(normalizedUSD.toFixed(2)),
        amountVES: Number(normalizedVES.toFixed(2)),
        exchangeRate: resolvedRate,
        paymentMethod: formState.paymentMethod,
        occurredAt: occurredAtIso,
        createdBy: user?.uid ?? "frontend_user",
        notes: formState.notes.trim()
      };

      await createDocument("expenses", `expense_${Date.now()}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setFormState(emptyForm);
    }
  });

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <PageHeader
          eyebrow="Gastos"
          title="Registro de gastos operativos"
          description="Controla gastos fijos y variables para el resumen financiero."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Nuevo gasto
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
              Registrar gasto
            </h2>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveExpenseMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Descripcion
              </span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, label: event.target.value }))
                }
                value={formState.label}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Categoria
                </span>
                <select
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      category: event.target.value as Expense["category"]
                    }))
                  }
                  value={formState.category}
                >
                  <option value="fixed">Fijo</option>
                  <option value="variable">Variable</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Fecha
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, occurredAt: event.target.value }))
                  }
                  type="date"
                  value={formState.occurredAt}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Monto USD
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, amountUSD: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.amountUSD}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Monto VES
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, amountVES: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.amountVES}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Metodo de pago
              </span>
              <select
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    paymentMethod: event.target.value as Expense["paymentMethod"]
                  }))
                }
                value={formState.paymentMethod}
              >
                <option value="cash_ves">Efectivo VES</option>
                <option value="cash_usd">Efectivo USD</option>
                <option value="transfer_ves">Transferencia VES</option>
                <option value="zelle">Zelle</option>
                <option value="mixed">Mixto</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Notas</span>
              <textarea
                className="min-h-24 w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, notes: event.target.value }))
                }
                value={formState.notes}
              />
            </label>

            {saveExpenseMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(saveExpenseMutation.error)}
              </div>
            ) : null}

            {saveExpenseMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Gasto guardado correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
              disabled={saveExpenseMutation.isPending}
              type="submit"
            >
              {saveExpenseMutation.isPending ? "Guardando..." : "Registrar gasto"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          <article className="panel-strong rounded-[30px] p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Total del periodo
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  USD
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                  {formatUsd(totals.usd)}
                </p>
              </div>
              <div className="rounded-[22px] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  VES
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                  {formatVes(totals.ves)}
                </p>
              </div>
            </div>
          </article>

          {expenses.map((expense) => (
            <article
              key={expense.id}
              className="panel-strong lift-hover reveal rounded-[30px] p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    {expense.data.category.toUpperCase()}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                    {expense.data.label}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    {new Date(expense.data.occurredAt).toLocaleString("es-VE")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {formatUsd(expense.data.amountUSD)}
                  </p>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {formatVes(expense.data.amountVES)}
                  </p>
                </div>
              </div>
              {expense.data.notes ? (
                <p className="mt-4 rounded-[20px] bg-white/82 px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                  {expense.data.notes}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
