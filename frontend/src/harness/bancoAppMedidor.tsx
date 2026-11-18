// Banco de pruebas: medidor, aviso de versión y «qué cambió» de la app (18/11/2026).
// /harness.html?ver=app-medidor[&estado=bien|rojo][&tema=claro] → la barra de arriba con
// el medidor, la franja de versión nueva y la tarjeta de novedades.
// Sin sesión ni base: simula la app de computador (window.mavenEscritorio).
import { Toaster } from "@/components/ui/sonner";
import { MedidorEquipo } from "@/components/MedidorEquipo";
import { AvisoActualizacionApp } from "@/components/AvisoActualizacionApp";
import { NovedadesApp } from "@/components/NovedadesApp";
import { CLAVE_VERSION, CLAVE_VISTAS_HASTA } from "@/lib/novedadesApp";

export function prepararAppFalsa(estado: string) {
  const rojo = estado === "rojo";
  Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 Chrome/140 MavenEscritorio/2.0.58", configurable: true });
  try {
    localStorage.setItem(CLAVE_VERSION, "2.0.57");
    localStorage.setItem(CLAVE_VISTAS_HASTA, "2026-11-17T00:00:00Z");
  } catch { /* sin almacenamiento */ }
  (window as Window & { mavenEscritorio?: unknown }).mavenEscritorio = {
    esApp: true,
    plataforma: "windows",
    memoria: async () => (rojo
      ? { app_mb: 740, equipo_gb: 8, libre_gb: 0.3, cpu_equipo_pct: 94, cpu_app_pct: 21 }
      : { app_mb: 520, equipo_gb: 8, libre_gb: 2.6, cpu_equipo_pct: 38, cpu_app_pct: 9 }),
    actualizacionPendiente: async () => "2.0.59",
    alActualizacionLista: () => () => {},
    actualizarAhora: async () => false,
  };
}

export function BancoAppMedidor() {
  return (
    <div className="fondo-glass flex h-dvh w-full flex-col overflow-hidden p-2 text-foreground">
      <header className="vidrio-barra z-30 flex h-14 shrink-0 items-center justify-end gap-2 px-4">
        <MedidorEquipo />
        <span className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
        <span className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
      </header>
      <main className="vidrio-panel relative mt-2 flex-1" />
      <AvisoActualizacionApp />
      <NovedadesApp />
      <Toaster />
    </div>
  );
}
