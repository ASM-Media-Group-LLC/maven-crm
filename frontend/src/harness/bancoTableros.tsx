// Banco visual de los tableros por rol (10/11/2026 — «quién mira qué»). No se
// compila en producción.
//   /harness.html?ver=mio   → «Tu día» (solo lo suyo)
//   /harness.html?ver=rrhh  → el tablero de RR. HH.
// Datos de ejemplo, sin sesión ni Supabase.
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Bell, CalendarDays, FolderOpen, Headset, Mail, MessageCircle } from "lucide-react";
import { MiTableroVista, type AvisoMio } from "@/pages/dashboard/MiTablero";
import { TableroRRHHVista, type DatosRRHH } from "@/pages/dashboard/TableroRRHH";
import { CajaDelEquipo } from "@/components/centro/PulsoEquipoVivo";
import { construirPulso } from "@/lib/pulsoEquipo";
import { useLanguage } from "@/hooks/useLanguage";
import type { NavCatalogEntry } from "@/lib/navCatalog";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const listo = <T,>(data: T) => ({ data, cargando: false, fallo: false, reintentar: () => {} });

const AVISOS: AvisoMio[] = [
  { id: "1", title: "Tu supervisor te dejó un aviso", message: "Recuerda prender la cámara al volver del almuerzo", created_at: hace(12), status: "new", deep_link_url: "/cowork" },
  { id: "2", title: "Nueva factura para revisar", message: "Factura #2041 de Unlok Media", created_at: hace(95), status: "new", deep_link_url: "/finanzas" },
  { id: "3", title: "Se actualizó tu horario", message: "Desde el lunes entras a las 8:00", created_at: hace(60 * 26), status: "read", deep_link_url: null },
];
const ACCESOS: NavCatalogEntry[] = [
  { title: "Correo", i18nKey: "nav.mail", url: "/correo", icon: Mail, section: "Menú" },
  { title: "Messenger", url: "/messenger", icon: MessageCircle, section: "Menú" },
  { title: "Cowork", url: "/cowork", icon: Headset, section: "Menú" },
  { title: "Calendario", url: "/oficina/calendario", icon: CalendarDays, section: "Oficina" },
  { title: "Drive", i18nKey: "nav.office.drive", url: "/oficina/drive", icon: FolderOpen, section: "Oficina" },
  { title: "Notificaciones", url: "/notificaciones", icon: Bell, section: "Menú" },
];

const p = (id: string, nombre: string, equipo: string) => ({ userId: id, nombre, avatarUrl: null, avatarSeed: null, equipo });
const ROSTER = [
  p("a", "Laura Gómez", "Chatters"), p("b", "Pedro Ruiz", "Chatters"), p("c", "Sofía Herrera", "Chatters"),
  p("d", "Mateo Díaz", "Chatters"), p("e", "Valentina Rojas", "PR"), p("f", "Camila Torres", "PR"),
  p("g", "Andrés Mora", "Finanzas"),
];
const PULSO = construirPulso(
  ROSTER,
  new Map([["a", { estado: "trabajando" as const, desde: hace(40) }], ["b", { estado: "pausa" as const, desde: hace(8) }], ["c", { estado: "celular" as const, desde: hace(3) }]]),
  new Set(["a", "b", "c", "e", "g"]),
);

const DATOS: DatosRRHH = {
  tardanzas: [
    { id: "t1", nombre: "Mateo Díaz", avatarUrl: null, avatarSeed: null, turno: "Turno AM", tardeMin: 23, entroAt: "2026-11-10T13:23:00Z" },
    { id: "t2", nombre: "Camila Torres", avatarUrl: null, avatarSeed: null, turno: "Turno AM", tardeMin: 7, entroAt: "2026-11-10T13:07:00Z" },
  ],
  asistencia: [
    { id: "a", nombre: "Laura Gómez", avatarUrl: null, avatarSeed: null, horas: 7.4, sinCamara: 0, sinPantalla: 0 },
    { id: "b", nombre: "Pedro Ruiz", avatarUrl: null, avatarSeed: null, horas: 6.9, sinCamara: 0.6, sinPantalla: 0.2 },
    { id: "c", nombre: "Sofía Herrera", avatarUrl: null, avatarSeed: null, horas: 5.1, sinCamara: 0, sinPantalla: 1.3 },
    { id: "e", nombre: "Valentina Rojas", avatarUrl: null, avatarSeed: null, horas: 3.25, sinCamara: 0, sinPantalla: 0 },
  ],
};

function PulsoDeEjemplo() {
  const { t, language } = useLanguage();
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {PULSO.cajas.map((c) => <CajaDelEquipo key={c.equipo} caja={c} t={t} lang={language} abrir={() => {}} />)}
    </div>
  );
}

export default function BancoTableros({ cual }: { cual: "mio" | "rrhh" }) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div className="flex h-dvh flex-col bg-background text-foreground">
          {cual === "mio"
            ? <MiTableroVista nombre="Angie" fecha="lunes, 10 de noviembre" horas={listo({ hoy: 5.2, semana: 5.2 })} avisos={listo(AVISOS)} accesos={ACCESOS} />
            : <TableroRRHHVista fecha="lunes, 10 de noviembre" datos={listo(DATOS)} pulso={<PulsoDeEjemplo />} />}
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
