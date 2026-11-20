import { AlarmClock, AlertTriangle, CalendarClock, LogIn, TrendingDown, UserX } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { FilaNumero } from "@/components/ui/ListaDeNumeros";
import { useHoyDelEquipo } from "@/hooks/useHoyDelEquipo";
import { rutaDeCifra } from "@/lib/cifrasDeHoy";
import type { TranslationKey } from "@/lib/i18n";

// LOS CUATRO ATAJOS, PRIMERO EN «LOS NÚMEROS DE HOY» (Alvaro, 18/11/2026: «lo
// primero que quiero saber es quién llegó tarde, quién llegó, quién va abajo en
// puntos, quién no está trabajando»). Desde el 20/11/2026 cada uno abre SU
// pantalla con la gente en tarjetas en vivo (pages/hoy/CifraDeHoy.tsx), en vez
// de desplegarse ahí mismo.

/** Las cuatro filas para «Los números de hoy». Vacío si quien mira no vigila al equipo. */
export function useAtajosDeHoy(habilitado: boolean): FilaNumero[] {
  const { t } = useLanguage();
  const { datos, cargando, fallo, cargandoNotas, falloNotas, reintentar } = useHoyDelEquipo(habilitado);
  if (!habilitado) return [];

  if (fallo) {
    return [{
      icono: AlertTriangle, tono: "danger", etiqueta: t("dashboard.atajos.fallo"), valor: "–",
      detalle: <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={reintentar}>{t("dashboard.centro.reintentar")}</button>,
    }];
  }
  if (cargando || !datos) {
    return (["dashboard.atajos.tarde", "dashboard.atajos.llegaron", "dashboard.atajos.abajo", "dashboard.atajos.noTrabajan"] as TranslationKey[])
      .map((k, i) => ({ icono: [AlarmClock, LogIn, TrendingDown, UserX][i], etiqueta: t(k), valor: "…" }));
  }

  const { llegaron, faltan, tarde, noTrabajan, porNota, conTurno } = datos;
  const sinConfirmar = conTurno.filter((p) => p.confirmado === false).length;
  const bajos = porNota.filter((p) => (p.nota ?? 100) < 60);

  return [
    {
      icono: AlarmClock, tono: tarde.length > 0 ? "warning" : "success",
      etiqueta: t("dashboard.atajos.tarde"), valor: tarde.length,
      detalle: faltan.length > 0 ? t("dashboard.atajos.tardeYFaltan", { n: faltan.length }) : t("dashboard.atajos.tardeDetalle"),
      href: rutaDeCifra("tarde"),
    },
    {
      icono: LogIn, tono: "success", etiqueta: t("dashboard.atajos.llegaron"),
      valor: <span>{llegaron.length}<span className="text-sm text-muted-foreground">/{llegaron.length + faltan.length}</span></span>,
      detalle: t("dashboard.atajos.llegaronDetalle"),
      href: rutaDeCifra("llegaron"),
    },
    {
      // Horarios de hoy (20/11/2026: «¿dónde miro los horarios?»).
      icono: CalendarClock, tono: sinConfirmar > 0 ? "warning" : "primary", etiqueta: t("dashboard.atajos.horarios"),
      valor: conTurno.length,
      detalle: sinConfirmar > 0 ? t("dashboard.atajos.horariosSinConfirmar", { n: sinConfirmar }) : t("dashboard.atajos.horariosDetalle"),
      href: rutaDeCifra("horarios"),
    },
    {
      icono: TrendingDown, tono: bajos.length > 0 ? "danger" : "success", etiqueta: t("dashboard.atajos.abajo"),
      valor: falloNotas ? "–" : cargandoNotas ? "…" : bajos.length,
      detalle: falloNotas ? t("dashboard.atajos.falloNotas") : t("dashboard.atajos.abajoDetalle"),
      href: rutaDeCifra("nota-baja"),
    },
    {
      icono: UserX, tono: noTrabajan.length > 0 ? "danger" : "success", etiqueta: t("dashboard.atajos.noTrabajan"),
      valor: noTrabajan.length, detalle: t("dashboard.atajos.noTrabajanDetalle"),
      separarCon: t("dashboard.atajos.ahoraMismo"),
      href: rutaDeCifra("no-trabajan"),
    },
  ];
}
