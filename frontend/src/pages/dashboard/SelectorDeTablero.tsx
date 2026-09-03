import { useSearchParams } from "react-router-dom";
import { BarChart3, Check, ChevronDown, Megaphone, Target, User, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRoleTier } from "@/hooks/useRoleTier";
import { cn } from "@/lib/utils";

// EL TÍTULO DEL TABLERO ES UN DESPLEGABLE (para admin).
//
// Pedido de Jhon: "en el dashboard de admin, ponme aquí que sea un desplegable
// y pueda escoger el dashboard de cualquier departamento". Cada rol entra y ve
// el suyo; el admin además puede pasearse por todos sin cambiar de sesión.
//
// La elección viaja en la URL (`?ver=`), así que se puede compartir el link y
// sobrevive un refresh. Para quien no puede cambiar, el título es un h1 normal:
// nadie ve un menú con opciones que no le corresponden.

export type ClaveTablero = "ventas" | "equipo" | "roster" | "pipeline" | "chatter";

export const TABLEROS: Array<{
  clave: ClaveTablero;
  titulo: string;
  depto: string;
  detalle: string;
  icono: typeof Users;
  /** true = la data es de la persona que mira, no del departamento. */
  personal?: boolean;
}> = [
  { clave: "ventas",   titulo: "Dashboard Ventas",     depto: "Dirección · Ventas",       detalle: "Ingresos de todas las creadoras y los tops del equipo", icono: BarChart3 },
  { clave: "equipo",   titulo: "Tu equipo de chatters", depto: "Supervisión de chatters",  detalle: "Turno de hoy, cumplimiento y a quién empujar",         icono: Users },
  { clave: "roster",   titulo: "Tu roster",            depto: "Managers de creadoras",    detalle: "Tu nota del bot, tus creadoras y su promoción",        icono: Megaphone, personal: true },
  { clave: "pipeline", titulo: "Tu pipeline",          depto: "Closers",                  detalle: "A contactar hoy, lo cerrado y tus horas",              icono: Target,    personal: true },
  { clave: "chatter",  titulo: "Tu día",               depto: "Chatters",                 detalle: "Turno, creadoras asignadas, nota y ventas",            icono: User,      personal: true },
];

export const tableroDe = (v: string | null): ClaveTablero | null =>
  TABLEROS.some((t) => t.clave === v) ? (v as ClaveTablero) : null;

/** Sustituye al `<h1>` de cada tablero. */
export default function SelectorDeTablero({ actual, titulo, clase }: {
  actual: ClaveTablero;
  /** Título a mostrar si se quiere pisar el del catálogo. */
  titulo?: string;
  /** Tipografía del título, si el tablero usa otra (el del chatter saluda en grande). */
  clase?: string;
}) {
  const [params, setParams] = useSearchParams();
  const { tier } = useRoleTier();
  const ficha = TABLEROS.find((t) => t.clave === actual);
  const texto = titulo ?? ficha?.titulo ?? "Dashboard";

  const claseTitulo = clase ?? "font-display text-lg font-bold leading-tight tracking-tight";

  // Solo el admin se pasea entre departamentos.
  if (tier !== "admin") {
    return <h1 className={claseTitulo}>{texto}</h1>;
  }

  const elegir = (clave: ClaveTablero) => {
    const siguiente = new URLSearchParams(params);
    // El de ventas es el que le toca por rol: sin parámetro en la URL.
    if (clave === "ventas") siguiente.delete("ver");
    else siguiente.set("ver", clave);
    setParams(siguiente, { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 -ml-1.5 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary">
        <h1 className={claseTitulo}>{texto}</h1>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          Ver el tablero de otro departamento
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TABLEROS.map((t) => (
          <DropdownMenuItem key={t.clave} onClick={() => elegir(t.clave)} className="gap-2.5 py-2">
            <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              t.clave === actual ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground")}>
              <t.icono className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{t.depto}</span>
                {t.clave === actual && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </span>
              <span className="block text-[11px] leading-snug text-muted-foreground">{t.detalle}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* Que quede claro qué se está viendo: en los tres tableros personales
            la data sale de quien mira (los RPC son "cada quien ve lo suyo"), así
            que sirven para revisar la PANTALLA, no la data de otra persona. */}
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Roster, closers y chatters son tableros personales: muestran <strong>tu</strong> data, no la de otra persona.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
