import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Supplier } from "../../domain/types.js";
import { createDocument, listDocuments, updateDocument } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

type SupplierFormState = {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
  status: Supplier["status"];
};

const emptyForm: SupplierFormState = {
  id: null,
  name: "",
  phone: "",
  email: "",
  notes: "",
  status: "active"
};

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado al consultar Firestore.";
}

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<SupplierFormState>(emptyForm);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => listDocuments("suppliers")
  });

  const suppliers = [...(suppliersQuery.data ?? [])].sort((left, right) =>
    left.data.name.localeCompare(right.data.name)
  );

  const saveSupplierMutation = useMutation({
    mutationFn: async () => {
      if (!formState.name.trim()) {
        throw new Error("El nombre del proveedor es obligatorio.");
      }

      const now = new Date().toISOString();
      const existing = suppliers.find((entry) => entry.id === formState.id)?.data;
      const supplierId = formState.id ?? `supplier_${Date.now()}`;

      const payload: Supplier = {
        name: formState.name.trim(),
        phone: formState.phone.trim(),
        email: formState.email.trim(),
        notes: formState.notes.trim(),
        status: formState.status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };

      if (formState.id) {
        await updateDocument("suppliers", supplierId, payload);
        return;
      }

      await createDocument("suppliers", supplierId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setFormState(emptyForm);
    }
  });

  const toggleSupplierMutation = useMutation({
    mutationFn: async (payload: { id: string; status: Supplier["status"] }) => {
      await updateDocument("suppliers", payload.id, {
        status: payload.status,
        updatedAt: new Date().toISOString()
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });

  function loadSupplier(id: string) {
    const existing = suppliers.find((entry) => entry.id === id)?.data;
    if (!existing) {
      return;
    }

    setFormState({
      id,
      name: existing.name,
      phone: existing.phone,
      email: existing.email,
      notes: existing.notes,
      status: existing.status
    });
  }

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <PageHeader
          eyebrow="Proveedores"
          title="Maestro de proveedores"
          description="Centraliza contactos y controla el estado de cada proveedor."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Nuevo proveedor
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                {formState.id ? "Editar proveedor" : "Crear proveedor"}
              </h2>
            </div>
            {formState.id ? (
              <button
                className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
                onClick={() => setFormState(emptyForm)}
                type="button"
              >
                Limpiar
              </button>
            ) : null}
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSupplierMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Nombre
              </span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                value={formState.name}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Telefono
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, phone: event.target.value }))
                  }
                  value={formState.phone}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Email
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, email: event.target.value }))
                  }
                  value={formState.email}
                />
              </label>
            </div>

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

            {saveSupplierMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(saveSupplierMutation.error)}
              </div>
            ) : null}

            {saveSupplierMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Proveedor guardado correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
              disabled={saveSupplierMutation.isPending}
              type="submit"
            >
              {saveSupplierMutation.isPending
                ? "Guardando..."
                : formState.id
                  ? "Actualizar proveedor"
                  : "Crear proveedor"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          {suppliers.map((supplier) => (
            <article
              key={supplier.id}
              className="panel-strong lift-hover reveal rounded-[30px] p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    Proveedor
                  </p>
                  <h2 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                    {supplier.data.name}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    {supplier.data.phone || "Sin telefono"}
                  </p>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {supplier.data.email || "Sin email"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    supplier.data.status === "active"
                      ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {supplier.data.status === "active" ? "Activo" : "Inactivo"}
                </span>
              </div>

              {supplier.data.notes ? (
                <p className="mt-4 rounded-[20px] bg-white/82 px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                  {supplier.data.notes}
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  className="rounded-[22px] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white"
                  onClick={() => loadSupplier(supplier.id)}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className="rounded-[22px] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white disabled:opacity-60"
                  disabled={toggleSupplierMutation.isPending}
                  onClick={() =>
                    void toggleSupplierMutation.mutateAsync({
                      id: supplier.id,
                      status: supplier.data.status === "active" ? "inactive" : "active"
                    })
                  }
                  type="button"
                >
                  {supplier.data.status === "active" ? "Inactivar" : "Activar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
