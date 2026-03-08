import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "./auth-provider.js";
import { getUserProfile } from "../lib/firestore.js";

function FullScreenLoader() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel-strong reveal rounded-[30px] px-6 py-5 text-center">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Cargando</p>
        <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
          Inicializando sesion
        </p>
      </div>
    </main>
  );
}

export function RequireAuth() {
  const { isReady, user } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  return <Outlet />;
}

export function RedirectIfAuthenticated() {
  const { isReady, user } = useAuth();

  if (!isReady) {
    return <FullScreenLoader />;
  }

  if (user) {
    return <Navigate replace to="/" />;
  }

  return <Outlet />;
}

export function RequireRoles({ allowedRoles }: { allowedRoles: string[] }) {
  const { isAnonymous, isReady, user } = useAuth();
  const location = useLocation();
  const userProfileQuery = useQuery({
    queryKey: ["users", user?.uid],
    queryFn: () => getUserProfile(user!.uid),
    enabled: Boolean(user?.uid) && !isAnonymous
  });

  if (!isReady || userProfileQuery.isLoading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  if (isAnonymous || !userProfileQuery.data || !allowedRoles.includes(userProfileQuery.data.role)) {
    return <Navigate replace to="/" />;
  }

  return <Outlet />;
}
