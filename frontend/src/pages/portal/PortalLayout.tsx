import { useMemo, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, House, IdCard, Loader2, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { esCuentaDeCreadora } from "@/lib/portal/cuenta";
import {
  type FichaDeAgencia,
  guardarFichaActiva,
  leerFichaActiva,
  nombreParaMostrar,
  PortalContext,
  useMisFichas,
  usePortalHola,
} from "@/hooks/usePortal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarcaM } from "@/components/MarcaM";
import { cn } from "@/lib/utils";

// EL ESPACIO DE LA CREADORA (portal de creadoras). Va FUERA del AppShell del
// equipo: nada de menú del CRM, Messenger, Cowork, llamadas ni avisos del equipo.
// Pensado primero para el celular (menú abajo); en el computador, menú al costado.
//
// Quién entra: solo una cuenta de creadora (app_metadata.tipo). Alguien del equipo
// que llega aquí vuelve a /dashboard; sin sesión, a /portal/entrar.

const SECCIONES: { a: string; icono: typeof House; etiqueta: TranslationKey; exacta?: boolean }[] = [
  { a: "/portal", icono: House, etiqueta: "portal.nav.inicio", exacta: true },
  { a: "/portal/ficha", icono: IdCard, etiqueta: "portal.nav.ficha" },
  { a: "/portal/ajustes", icono: Settings, etiqueta: "portal.nav.ajustes" },
];

const inicial = (f: FichaDeAgencia) => nombreParaMostrar(f).slice(0, 1).toUpperCase();

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      {children}
    </div>
  );
}

export default function PortalLayout() {
  const { t } = useLanguage();
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const esCreadora = esCuentaDeCreadora(user);
  const fichas = useMisFichas(user && esCreadora ? user.id : null);
  const [elegida, setElegida] = useState<string | null>(leerFichaActiva);

  const activa = useMemo(() => {
    const lista = fichas.data ?? [];
    return lista.find((f) => f.creator_id === elegida) ?? lista[0];
  }, [fichas.data, elegida]);
  usePortalHola(activa?.creator_id);

  const salir = async () => {
    await signOut();
    navigate("/portal/entrar", { replace: true });
  };

  if (loading) {
    return (
      <Pantalla>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </Pantalla>
    );
  }
  if (!user) return <Navigate to="/portal/entrar" replace state={{ from: location }} />;
  if (!esCreadora) return <Navigate to="/dashboard" replace />;

  if (fichas.isLoading) {
    return (
      <Pantalla>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("portal.shell.cargando")}</p>
      </Pantalla>
    );
  }
  if (fichas.isError) {
    return (
      <Pantalla>
        <h1 className="text-xl font-semibold">{t("portal.shell.errorTitulo")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("portal.shell.errorTexto")}</p>
        <Button onClick={() => fichas.refetch()}>{t("portal.shell.reintentar")}</Button>
      </Pantalla>
    );
  }
  if (!activa) {
    return (
      <Pantalla>
        <h1 className="text-xl font-semibold">{t("portal.shell.sinAccesoTitulo")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("portal.shell.sinAccesoTexto")}</p>
        <Button variant="outline" onClick={salir}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("portal.shell.salir")}
        </Button>
      </Pantalla>
    );
  }

  const lista = fichas.data ?? [];
  const elegir = (id: string) => {
    guardarFichaActiva(id);
    setElegida(id);
  };

  const selectorDeAgencia = (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={lista.length < 2}
        className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        aria-label={t("portal.shell.cambiarAgencia")}
      >
        <span className="truncate">{activa.agencia}</span>
        {lista.length > 1 && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("portal.shell.cambiarAgencia")}</DropdownMenuLabel>
        {lista.map((f) => (
          <DropdownMenuItem key={f.creator_id} onSelect={() => elegir(f.creator_id)} className="min-h-11 gap-2">
            <Check className={cn("h-4 w-4", f.creator_id === activa.creator_id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
            <span className="truncate">{f.agencia}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const avatar = (clase: string) => (
    <Avatar className={clase}>
      {activa.foto && <AvatarImage src={activa.foto} alt="" />}
      <AvatarFallback className="bg-primary/15 font-semibold text-primary">{inicial(activa)}</AvatarFallback>
    </Avatar>
  );

  return (
    <PortalContext.Provider value={{ fichas: lista, activa, elegir }}>
      <div className="min-h-dvh bg-background text-foreground md:flex">
        {/* Computador: menú al costado */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card/60 p-4 md:flex">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <MarcaM alto="13px" />
            </span>
            <span className="font-semibold">{t("portal.shell.espacio")}</span>
          </div>
          <nav aria-label={t("portal.nav.menu")} className="mt-6 flex flex-col gap-1">
            {SECCIONES.map(({ a, icono: Icono, etiqueta, exacta }) => (
              <NavLink
                key={a}
                to={a}
                end={exacta}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <Icono className="h-5 w-5" aria-hidden="true" />
                {t(etiqueta)}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-3 rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-3">
              {avatar("h-10 w-10")}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{nombreParaMostrar(activa)}</p>
                <p className="truncate text-xs text-muted-foreground">{t("portal.shell.agencia", { agencia: activa.agencia })}</p>
              </div>
            </div>
            {lista.length > 1 && selectorDeAgencia}
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={salir}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.shell.salir")}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Celular: arriba la marca y la agencia */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              {avatar("h-9 w-9")}
              <span className="truncate font-semibold">{nombreParaMostrar(activa)}</span>
            </div>
            <div className="min-w-0 shrink">{selectorDeAgencia}</div>
          </header>

          <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10">
            <Outlet />
          </main>

          {/* Celular: el menú abajo, al alcance del pulgar */}
          <nav
            aria-label={t("portal.nav.menu")}
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          >
            {SECCIONES.map(({ a, icono: Icono, etiqueta, exacta }) => (
              <NavLink
                key={a}
                to={a}
                end={exacta}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                <Icono className="h-6 w-6" aria-hidden="true" />
                {t(etiqueta)}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </PortalContext.Provider>
  );
}
