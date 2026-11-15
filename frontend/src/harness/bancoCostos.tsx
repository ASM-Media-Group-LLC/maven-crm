// Banco del tablero de gasto de Costos (14/11/2026): /harness.html?ver=costos
// Siembra la caché de React Query con los números reales del 14/11 a las 10:55 p. m.
// (servicios, lecturas de Google, uso del mes y saldo de Gemini), así se dibuja sin
// sesión ni Supabase. Solo para mirar; no se compila en producción.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TableroGasto from "@/components/costos/TableroGasto";

const s = (id: string, nombre: string, proveedor: string, parte: string, monto: number | null, extra: Record<string, unknown> = {}) => ({
  id, nombre, proveedor, parte, categoria: "servidores", es_maven: parte !== "otras", monto_usd: monto, ciclo: "mensual", fuente: monto === null ? "falta" : "factura",
  detalle: null, proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null,
  orden: 10, activo: true, revisado_at: "", precio_unitario_usd: null, unidad: null, ...extra,
});

const SERVICIOS = [
  s("claude", "Claude (plan Ultra)", "Anthropic", "herramientas", 93.67, { activo: false }),
  s("google_ia", "IA de Google (Argos y cámara)", "Google AI Studio", "argos", 48, { ciclo: "uso", precio_unitario_usd: 0.0022, unidad: "foto_juzgada" }),
  s("elevenlabs", "Voz de los avisos (ElevenLabs)", "ElevenLabs", "argos", 2.87, { ciclo: "uso" }),
  s("supabase_maven", "Base de datos de Maven (Supabase)", "Supabase", "base", 114.54),
  s("contabo_principal", "Servidor principal (Contabo)", "Contabo", "base", null),
  s("contabo_llamadas", "Servidor de llamadas (Contabo)", "Contabo", "cowork", 17),
  s("resend", "Envío de correos (Resend Pro)", "Resend", "correo", 20, { ahorro_usd: 20, ahorro_detalle: "Bajar a plan gratis (3.000 correos al mes, 100 al día): Maven manda ~4 al día" }),
  s("zoho", "Correos del equipo (Zoho, @maven-ai.me)", "Zoho", "correo", null),
  s("godaddy_maven", "Dominio maven-ai.me (GoDaddy)", "GoDaddy", "base", 29.99, { ciclo: "anual" }),
  s("github", "Código y pruebas (GitHub)", "GitHub", "herramientas", 0),
  s("supabase_otros", "Supabase: otros 21 proyectos", "Supabase", "otras", 212.97, { ahorro_usd: 78.48, ahorro_detalle: "Pausa los 8 proyectos que nadie usa (ninguno es Maven): cada uno cuesta ≈ USD 9,81 al mes." }),
];

const LECTURAS = [
  { servicio_id: "google_ia", fecha: "2026-11-11", monto_usd: 17.44, fuente: "lectura", nota: "Uso del 1 al 11 de noviembre" },
  { servicio_id: "google_ia", fecha: "2026-11-13", monto_usd: 30.16, fuente: "lectura", nota: "Gastado del 1 al 13/11 según AI Studio" },
];

const JUZGADAS = [2, 1168, 2200, 2207, 1599, 1, 1, 0, 1914, 2156, 2061, 2026, 1691, 4534];
const USO = {
  desde: "2026-11-01", hoy: "2026-11-14", dias_del_mes: 30, calculado_at: "2026-11-15T03:55:57Z",
  dias: JUZGADAS.map((j, i) => ({ dia: `2026-11-${String(i + 1).padStart(2, "0")}`, pantalla: 0, camara: 0, juzgadas: j, al_nas: 0, videos: 0, video_seg: 0 })),
  almacenamiento: [],
};

const SALDO = {
  estado: "se_acaba_hoy", saldo_usd: 9.9, punto: { id: 1, saldo_usd: 19.87, medido_at: "2026-11-14T14:17:00Z", origen: "recarga" },
  juzgadas_desde: 4533, gastado_usd: 9.97, precio_foto_usd: 0.0022, ritmo_dia_usd: 9.97, dias_restantes: 1.0,
  se_acaba_at: "2026-11-16T03:55:57Z", ultimo_ok: "2026-11-15T03:54:16Z", sin_saldo_at: null, argos_activo: true,
  calculado_at: "2026-11-15T03:55:57Z",
};

export default function BancoCostos() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchInterval: false, refetchOnWindowFocus: false } } });
  cliente.setQueryData(["costos-tablero"], { servicios: SERVICIOS, cobros: [], lecturas: LECTURAS });
  cliente.setQueryData(["costos-uso-del-mes"], USO);
  cliente.setQueryData(["costos-saldo-gemini"], SALDO);
  return (
    <QueryClientProvider client={cliente}>
      <div className="min-h-dvh bg-background p-4 text-foreground sm:p-6">
        <div className="mx-auto max-w-6xl"><TableroGasto /></div>
      </div>
    </QueryClientProvider>
  );
}
