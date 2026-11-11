// Banco visual de Ajustes → Conectar tu plataforma (11/11/2026). No se compila en
// producción. Datos de ejemplo metidos en la caché de react-query (staleTime
// infinito): la pantalla no consulta Supabase ni ninguna edge.
//   /harness.html?ver=conexion                 → ensayo con un envío
//   /harness.html?ver=conexion&estado=vacio    → sin conectar
//   /harness.html?ver=conexion&estado=aplicando
//   /harness.html?ver=conexion&estado=sin-aviso → con llave y sin aviso (el alta)
//   …&tema=claro  → tema claro      …&skin=dorado → un primario oscuro
//   …&abrir=1     → con el detalle del envío, las instrucciones y las entregas abiertos
// Y por si algo se escapa de la caché: supabase.rpc/from quedan tapados aquí (nunca
// salen a la base de verdad).
import { useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ConexionEquipo from "@/pages/admin/ConexionEquipo";
import { CLAVE, type Integracion, type ListaLlaves, type Pendiente, type RolSinPermisos } from "@/pages/admin/conexionEquipo/datos";
import { leerSync } from "@/lib/conexionEquipo/resumen";
import type { EntregaEquipo, WebhookEquipo } from "@/lib/conexionEquipo/webhook";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const AGENCIA = "7d0a5b1e-1111-4c2d-9e3f-000000000001";
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const LLAVE = {
  id: "k-equipo", name: "Backstage producción", key_prefix: "mvk_live_ab12", last_four: "9f3a", scopes: ["equipo:write"],
  ip_whitelist: [], created_at: hace(60 * 24 * 2), created_by_email: "alvaro@maven-ai.me", last_used_at: hace(40),
  request_count: 12, expires_at: null, revoked_at: null, status: "active" as const,
  acts_as: { id: YO, name: "Alvaro Mejía", active: true },
};

const AVISO: WebhookEquipo = {
  id: "w1", api_key_id: "k-equipo", url_host: "hooks.backstage.io",
  eventos: ["equipo.persona_entro", "equipo.persona_salio", "equipo.rol_cambio"], status: "active",
  disabled_reason: null, disabled_at: null, secret_last4: "9f3a", consecutive_failures: 0, failing_since: null,
  last_attempt_at: hace(50), last_success_at: hace(50), last_status_code: 200, last_error: null,
  created_by: YO, created_at: hace(60 * 30), pendientes: 0,
};
const entrega = (id: string, evento: string, min: number, extra: Partial<EntregaEquipo> = {}): EntregaEquipo => ({
  id, evento, state: "delivered", drop_reason: null, attempts: 1, next_attempt_at: null, last_attempt_at: hace(min),
  last_status_code: 200, last_error: null, latency_ms: 180, uncertain: false, created_at: hace(min), delivered_at: hace(min), ...extra,
});
const ENTREGAS: EntregaEquipo[] = [
  entrega("e1", "equipo.rol_cambio", 50),
  entrega("e2", "equipo.persona_salio", 120, { state: "pending", attempts: 2, last_status_code: 503, delivered_at: null, latency_ms: 900 }),
  entrega("e3", "equipo.persona_entro", 60 * 3),
  entrega("e4", "webhook.test", 60 * 29, { latency_ms: 95 }),
];

// Nada de este banco sale a la base: si una consulta se escapa de la caché, falla aquí.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tapado = supabase as unknown as { rpc: any; from: any };
tapado.rpc = (fn: string) => Promise.resolve(
  fn === "equipo_webhook_entregas" ? { data: ENTREGAS, error: null } : { data: null, error: { message: "banco: sin base" } },
);
tapado.from = () => {
  const r = { data: null, error: { message: "banco: sin base" } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = { select: () => b, eq: () => b, order: () => b, limit: () => b, update: () => b,
    maybeSingle: () => Promise.resolve(r), then: (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok) };
  return b;
};

const ENVIO = (ensayo: boolean, min: number) => leerSync({
  id: `s-${min}`, created_at: hace(min), ultima_vez: hace(min - 30), repeticiones: min === 40 ? 3 : 1, ensayo, recibidas: 48,
  resumen: {
    recibidas: 48,
    cambios: [
      { user_id: "u1", correo: "laura.gomez@agencia.com", nombre: "Laura Gómez", campo: "rol", antes: "Chatter", despues: "Chatter Supervisor" },
      { user_id: "u2", correo: "pedro.ruiz@agencia.com", nombre: "Pedro Ruiz", campo: "equipo", antes: null, despues: "Turno AM" },
      { user_id: "u3", correo: "sofia.herrera@agencia.com", nombre: "Sofía Herrera", campo: "hora_entrada", antes: "09:00:00", despues: "08:00:00" },
      { user_id: "u4", correo: "mateo.diaz@agencia.com", nombre: "Mateo Díaz", campo: "papelera", antes: null, despues: "papelera" },
      { user_id: "u5", correo: "camila.torres@agencia.com", nombre: "Camila Torres", campo: "rol", antes: "Chatter", despues: "Closer Senior" },
    ],
    pendientes_de_crear: [
      { correo: "valentina.rojas@agencia.com", nombre: "Valentina Rojas", rol: "Chatter", equipo: "Turno PM" },
      { correo: "andres.mora@agencia.com", nombre: "Andrés Mora", rol: "Closer Senior", equipo: null },
    ],
    roles_desconocidos: [{ rol: "Closer Senior", correos: ["andres.mora@agencia.com", "camila.torres@agencia.com"] }],
    protegidos: [{ user_id: YO, correo: "alvaro@maven-ai.me", nombre: "Alvaro Mejía", motivo: "admin_o_dueno" }],
    no_vienen_en_backstage: [{ user_id: "u9", correo: "isabel.tuiran@agencia.com", nombre: "Isabel Tuiran", rol: "Warming" }],
    en_papelera: [],
    rechazados: [
      { indice: 7, correo: "jefa.turno@agencia.com", campo: "nivel", motivo: "nivel_de_admin", valor: "admin" },
      { indice: 12, correo: "nuevo@agencia", campo: "correo", motivo: "correo_invalido", valor: "nuevo@agencia" },
    ],
    freno_de_bajas: null,
  },
  aplicados: [{ user_id: "u1", campo: "rol" }, { user_id: "u2", campo: "equipo" }, { user_id: "u3", campo: "hora_entrada" }, { user_id: "u4", campo: "papelera" }],
  rechazados_base: [{ user_id: "u5", campo: "rol", motivo: "rol_desconocido" }],
});

const PENDIENTES: Pendiente[] = [
  { id: "p1", correo: "valentina.rojas@agencia.com", nombre: "Valentina Rojas", rol: "Chatter", nivel: "agente", equipo: "Turno PM",
    reporta_a_correo: "laura.gomez@agencia.com", veces: 3, primera_vez: hace(60 * 26), ultima_vez: hace(40), estado: "pendiente" },
  { id: "p2", correo: "andres.mora@agencia.com", nombre: "Andrés Mora", rol: "Closer Senior", nivel: "agente", equipo: null,
    reporta_a_correo: null, veces: 1, primera_vez: hace(40), ultima_vez: hace(40), estado: "pendiente" },
];
const ROLES: RolSinPermisos[] = [{ nombre: "Closer Senior", creado_at: hace(60 * 3) }];

function sembrar(qc: QueryClient, estado: string) {
  const vacio = estado === "vacio";
  const aplicando = estado === "aplicando";
  const sinAviso = estado === "sin-aviso";
  const integracion: Integracion = {
    tenant_id: AGENCIA,
    aplicar: aplicando,
    ultima_sync: vacio ? null : { recibidas: 48, cambios: 5, aplicados: aplicando ? 4 : 0, rechazados: 3 },
    ultima_sync_at: vacio ? null : hace(40),
  };
  const llaves: ListaLlaves = { keys: vacio ? [] : [LLAVE], you: { id: YO, name: "Alvaro Mejía" } };
  qc.setQueryData(CLAVE.integracion, integracion);
  qc.setQueryData(CLAVE.llaves, llaves);
  qc.setQueryData(CLAVE.syncs, vacio ? [] : [ENVIO(!aplicando, 40), ENVIO(true, 60 * 5), ENVIO(true, 60 * 26)]);
  qc.setQueryData(CLAVE.pendientes, vacio ? [] : PENDIENTES);
  qc.setQueryData(CLAVE.roles, vacio ? [] : ROLES);
  qc.setQueryData(["es-dueno", YO, AGENCIA], true);
  qc.setQueryData(CLAVE.webhooks, vacio || sinAviso ? [] : [AVISO]);
  qc.setQueryData(CLAVE.entregas(AVISO.id), ENTREGAS);
}

export default function BancoConexionEquipo({ estado, abrir = false }: { estado: string; abrir?: boolean }) {
  useEffect(() => {
    if (!abrir) return;
    const id = setTimeout(() => {
      document.querySelectorAll<HTMLButtonElement>('button[data-state="closed"]').forEach((b) => b.click());
      document.querySelectorAll<HTMLButtonElement>('button[aria-controls="instrucciones-equipo"]').forEach((b) => b.click());
      document.querySelectorAll<HTMLButtonElement>('#avisos button[aria-expanded="false"]').forEach((b) => b.click());
    }, 300);
    return () => clearTimeout(id);
  }, [abrir]);
  const qc = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } });
    sembrar(c, estado);
    return c;
  }, [estado]);
  const auth = useMemo(() => ({ user: { id: YO } as User, session: null, loading: false, signOut: async () => {} }), []);
  return (
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/settings?sub=conexion-equipo"]}>
          <div className="fondo-glass flex min-h-dvh w-full p-2">
            <main className="vidrio-panel min-w-0 flex-1">
              <ConexionEquipo />
            </main>
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
