import { useState } from "react";

import { useAuth } from "../../auth/auth-provider.js";

export function LoginPage() {
  const { loginAsGuest, loginWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleEmailLogin() {
    setError("");
    setIsLoading(true);

    try {
      await loginWithEmail(email, password);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo iniciar sesion.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGuestLogin() {
    setError("");
    setIsLoading(true);

    try {
      await loginAsGuest();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "No se pudo abrir la sesion temporal."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="hero-panel glass-card w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.26em] text-[var(--color-brand)]">Acceso</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--color-ink)]">
          Ingresa al sistema
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
          Puedes entrar con correo y clave si activaste usuarios reales, o abrir una sesion invitada para desbloquear lectura de Firestore durante desarrollo.
        </p>

        <div className="mt-8 space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm text-[var(--color-ink-soft)]">Correo</span>
            <input
              className="w-full rounded-2xl border border-[var(--color-line)] bg-white/80 px-4 py-3 outline-none placeholder:text-slate-400"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@pulpa.local"
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-[var(--color-ink-soft)]">Clave</span>
            <input
              className="w-full rounded-2xl border border-[var(--color-line)] bg-white/80 px-4 py-3 outline-none placeholder:text-slate-400"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              type="password"
              value={password}
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          <button
            className="w-full rounded-2xl bg-[var(--color-brand)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
            disabled={isLoading}
            onClick={() => {
              void handleEmailLogin();
            }}
            type="button"
          >
            {isLoading ? "Entrando..." : "Entrar con correo"}
          </button>

          <button
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white/85 px-4 py-3 text-sm font-medium text-[var(--color-ink)] transition hover:bg-white disabled:opacity-60"
            disabled={isLoading}
            onClick={() => {
              void handleGuestLogin();
            }}
            type="button"
          >
            Entrar como invitado
          </button>
        </div>
      </section>
    </main>
  );
}
