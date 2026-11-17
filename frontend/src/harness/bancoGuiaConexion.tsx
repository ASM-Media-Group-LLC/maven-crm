// Banco de pruebas: Guía de conexión (/conexion, 17/11/2026).
// /harness.html?ver=guia-conexion[&estado=quieto|probando|bien|justo|malo|incompleta|error][&tema=claro]
// Pinta la página dentro de un cascarón como el del AppShell (atmósfera + panel
// de vidrio), sin sesión: los números son de pruebas reales de llamada_salud
// (mediana del equipo: subida 11,8 · bajada 30 · respuesta 323 ms).
import { MemoryRouter } from "react-router-dom";
import { VistaGuiaConexion, type EstadoPrueba } from "@/pages/conexion/GuiaConexionPage";
import type { PruebaDeRed } from "@/lib/pruebaDeRed";

const at = "2026-11-17T12:00:00.000Z";
const PRUEBAS: Record<string, PruebaDeRed> = {
  bien: { subida_mbps: 11.8, bajada_mbps: 30.3, ms: 323, at },
  justo: { subida_mbps: 2.3, bajada_mbps: 8.6, ms: 440, at },
  malo: { subida_mbps: 0.4, bajada_mbps: 3.9, ms: 849, at, subida_tope: true },
  incompleta: { subida_mbps: null, bajada_mbps: 12, ms: 300, at },
};

function estadoDe(nombre: string): EstadoPrueba {
  if (nombre === "probando") return { fase: "probando" };
  if (nombre === "error") return { fase: "error" };
  const prueba = PRUEBAS[nombre];
  return prueba ? { fase: "listo", prueba, enLlamada: nombre === "justo" } : { fase: "quieto" };
}

export default function BancoGuiaConexion({ estado }: { estado: string }) {
  return (
    <MemoryRouter>
      <div className="fondo-glass flex h-dvh w-full overflow-hidden p-2 text-foreground">
        <main className="vidrio-panel relative flex flex-1 flex-col min-h-0 overflow-hidden">
          <VistaGuiaConexion estado={estadoDe(estado)} onProbar={() => {}} />
        </main>
      </div>
    </MemoryRouter>
  );
}
