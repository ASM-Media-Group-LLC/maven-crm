import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { usd, type Cobro } from "@/lib/costos";
import type { Parte, ServicioConParte, UsoDelMes } from "@/lib/costosPorParte";

// Lo que comparten las tres pestañas de Costos y conexiones (rediseño del
// 13/11/2026): las consultas, el fallo compacto (UNA fila con Reintentar, nunca
// una caja roja gigante ni ceros), la pastilla neutra con su puntito y los
// nombres de cada parte de Maven.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

export const hoyEnColombia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
export const nombreDeMes = (mes: string, idioma: string, forma: "long" | "short" = "long") =>
  new Date(`${mes.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString(idioma, { month: forma }).replace(".", "");
export const redondo = (n: number) => usd(Math.round(n));
export const exacto = (n: number) => usd(Math.round(n * 100) / 100);
export const miles = (n: number, idioma: string) => Math.round(n).toLocaleString(idioma === "en" ? "en-US" : "es-CO");
export const fechaCorta = (f: string, idioma: string) =>
  new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString(idioma, { day: "numeric", month: "short" }).replace(".", "");

/** Los servicios (facturas) y cada cobro: la base de Costos. */
export function useCostos() {
  return useQuery({
    queryKey: ["costos-tablero"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [s, c] = await Promise.all([
        sinTipar.from("costos_servicios").select("*").order("orden"),
        sinTipar.from("costos_cobros").select("servicio_id, fecha, monto_usd, fuente, nota").order("fecha"),
      ]);
      if (s.error) throw new Error(s.error.message);
      if (c.error) throw new Error(c.error.message);
      return { servicios: (s.data ?? []) as ServicioConParte[], cobros: (c.data ?? []) as Cobro[] };
    },
  });
}

/** El uso real de cada día del mes (RPC costos_uso_del_mes, solo el dueño). */
export function useUsoDelMes() {
  return useQuery({
    queryKey: ["costos-uso-del-mes"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("costos_uso_del_mes");
      if (error) throw new Error(error.message);
      if (!data || !Array.isArray(data.dias)) throw new Error("sin datos");
      return data as UsoDelMes;
    },
  });
}

export const CLAVE_PARTE: Record<Parte, { nombre: TranslationKey; titulo: TranslationKey; que: TranslationKey }> = {
  argos: { nombre: "oficina.costos.parte.argos", titulo: "oficina.costos.parte.argosTitulo", que: "oficina.costos.parte.argosQue" },
  base: { nombre: "oficina.costos.parte.base", titulo: "oficina.costos.parte.base", que: "oficina.costos.parte.baseQue" },
  cowork: { nombre: "oficina.costos.parte.cowork", titulo: "oficina.costos.parte.cowork", que: "oficina.costos.parte.coworkQue" },
  correo: { nombre: "oficina.costos.parte.correo", titulo: "oficina.costos.parte.correo", que: "oficina.costos.parte.correoQue" },
  messenger_drive: { nombre: "oficina.costos.parte.messengerDrive", titulo: "oficina.costos.parte.messengerDrive", que: "oficina.costos.parte.messengerDriveQue" },
  herramientas: { nombre: "oficina.costos.parte.herramientas", titulo: "oficina.costos.parte.herramientas", que: "oficina.costos.parte.herramientasQue" },
  otras: { nombre: "oficina.costos.parte.otras", titulo: "oficina.costos.parte.otras", que: "oficina.costos.parte.otrasQue" },
};

/** Un puntito de color (estado o parte). */
export function Punto({ color, className = "h-2 w-2" }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

/** Pastilla neutra con un puntito de color (sistema de diseño: sin colorcitos de fondo). */
export function Pastilla({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-foreground/[0.04] px-2 py-0.5 text-[11px] font-medium text-foreground/85">
      <Punto color={color} className="h-1.5 w-1.5" />
      {children}
    </span>
  );
}

/** Un fallo es UNA fila compacta con Reintentar (nunca ceros, nunca «no hay nada»). */
export function FalloCompacto({ texto, onReintentar, ocupado }: { texto?: string; onReintentar: () => void; ocupado?: boolean }) {
  const { t } = useLanguage();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
      <Punto color="hsl(var(--destructive))" />
      <span className="min-w-0 flex-1 text-muted-foreground">{texto ?? t("oficina.costos.fallo")}</span>
      <button type="button" onClick={onReintentar} disabled={ocupado}
        className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60">
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {t("oficina.costos.reintentar")}
      </button>
    </div>
  );
}

export const Cargando = ({ alto = "py-8" }: { alto?: string }) => (
  <div className={`flex items-center justify-center ${alto}`}><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

/** Panel de vidrio con cabecera (título, qué es y a la derecha su número). */
export function Panel({ titulo, sub, derecha, children, className = "", id }: {
  titulo: ReactNode; sub?: ReactNode; derecha?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section aria-labelledby={id} className={`vidrio sube overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/50 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="text-[15px] font-semibold text-foreground">{titulo}</h2>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  );
}
