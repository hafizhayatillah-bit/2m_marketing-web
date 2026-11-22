import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, errorMessage, setSessionLostHandler } from "../../lib/api";

const ME_KEY = ["auth-me"];

interface Session {
  username: string;
  logout: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside AuthGate");
  return ctx;
}

// Tanpa sesi -> halaman masuk. Sesi = cookie HttpOnly; frontend tidak pernah memegang token.
export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.get<{ username: string }>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    setSessionLostHandler(() => {
      queryClient.setQueryData(ME_KEY, null);
    });
  }, [queryClient]);

  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
    },
  });

  if (me.isLoading)
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-busy="true">
        <div className="skeleton h-12 w-64" />
      </div>
    );
  if (me.isError)
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="alert-box max-w-md" role="alert">
          {errorMessage(me.error)}
          <button className="btn btn-secondary btn-sm mt-3" onClick={() => void me.refetch()}>
            Coba lagi
          </button>
        </div>
      </div>
    );
  if (!me.data) return <LoginPage onLoggedIn={(u) => queryClient.setQueryData(ME_KEY, u)} />;

  return (
    <SessionContext.Provider value={{ username: me.data.username, logout: () => logout.mutate() }}>{children}</SessionContext.Provider>
  );
}

function LoginPage({ onLoggedIn }: { onLoggedIn: (u: { username: string }) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api.post<{ username: string }>("/auth/login", { username: username.trim(), password }),
    onSuccess: onLoggedIn,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (username.trim() && password) login.mutate();
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-rail p-10 text-rail-foreground lg:flex">
        <span className="flex size-12 items-center justify-center rounded-md bg-rail-foreground text-lg font-extrabold tracking-tight text-rail">
          2M
        </span>
        <div className="flex flex-col gap-4">
          <h1 className="t-display">Admin toko</h1>
          <p className="max-w-md text-lg text-rail-muted">
            Harga, modal, stok dan penjualan kiosk belanja mandiri 2M Sembako, dalam satu tempat.
          </p>
        </div>
        <p className="text-sm text-rail-muted">Kiosk Jatibening</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form className="flex w-full max-w-sm flex-col gap-5 animate-rise" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <span className="flex size-11 items-center justify-center rounded-md bg-rail text-base font-extrabold tracking-tight text-rail-foreground lg:hidden">
              2M
            </span>
            <h2 className="t-headline">Masuk</h2>
            <p className="text-muted-foreground">Pakai akun admin 2M Sembako (sama dengan admin website).</p>
          </div>
          <label className="field-label flex flex-col gap-1.5">
            Username
            <input
              className="field"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={login.isPending}
              autoFocus
            />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            Password
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={login.isPending}
            />
          </label>
          {login.isError && (
            <p className="alert-box" role="alert">
              {errorMessage(login.error)}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={login.isPending || !username.trim() || !password}>
            {login.isPending ? "Memproses…" : "Masuk"}
          </button>
        </form>
      </section>
    </div>
  );
}
