// LA PLATAFORMA MAVEN (vagones 4–8, alcance de las tandas 7 y 8 del spec
// docs/maven-como-lumina-spec.md): Dueño → Clientes → Trabajadores.
//
// Un cliente «normal» es una organización con UNA agencia (tenant) donde vive su
// gente; su admin no ve el nivel de agencias. Sin reventa, sin socios ni briefs
// por ahora. Logo + nombre del cliente («X · powered by Maven»). Stripe para el
// plan mensual, las recargas de Argos y el setup.
//
// Estos tipos calcan lo que devuelven las funciones del edificio
// (infra/edificio/migraciones/20261119211000_arbol_funciones.sql). La pantalla
// solo habla con `PlataformaDatos`: hoy la implementa `mock.ts` (datos de
// ejemplo, sin Supabase) y mañana `supabase.ts` (las RPC del edificio).

export type TipoDeYo = "dueno" | "admin_plataforma" | "admin_cliente";

/** Quién está mirando. El dueño ve precios y cobros; Grace (admin de plataforma) no. */
export interface Yo {
  user_id: string;
  nombre: string;
  correo: string;
  tipo: TipoDeYo;
  /** Solo para el admin de un cliente: su organización. */
  organizacion_id?: string;
}

export type EstadoOrganizacion = "preparacion" | "activa" | "pausada" | "archivada";
export type ClaveDePlan = "equipo" | "empresa" | "enterprise";

/** organizaciones.plan. Sin precio_usd / setup_usd / argos_usd_mes cuando lo lee el equipo de Maven. */
export interface PlanOrganizacion {
  nombre: ClaveDePlan;
  personas: number;
  precio_usd?: number;
  setup_usd?: number;
  argos_usd_mes?: number;
  /** Opciones especiales del alta por el dueño o Grace (tanda 8). */
  dias_gratis?: number;
  sin_tarjeta?: boolean;
  sin_setup?: boolean;
  precio_a_medida?: boolean;
}

/** organizaciones.marca: «{nombre} · powered by Maven». */
export interface MarcaOrganizacion {
  nombre?: string;
  logo_url?: string | null;
  /** Color de la tarjeta del cliente (su marca, no el morado de Maven). */
  color?: string;
}

export interface OrganizacionBase {
  id: string;
  nombre: string;
  slug: string;
  tipo: "normal" | "marca_blanca";
  estado: EstadoOrganizacion;
  es_demo: boolean;
  plan: PlanOrganizacion | null;
  marca: MarcaOrganizacion;
}

export interface SaldoArgos {
  saldo_usd: number;
  /** Sin saldo, Argos se pausa (lo demás de Maven sigue). */
  pausado: boolean;
  /** Crédito que trae el plan cada mes (no lo ve Grace). */
  argos_usd_mes?: number | null;
}

/** Una tarjeta de «Tus clientes» (organizaciones_del_dueno → clientes[]). */
export interface ClienteDelDueno {
  id: string;
  organizacion: OrganizacionBase;
  /** Personas que trae el plan. */
  paquete: number;
  /** Personas que ya ocupan silla. */
  ocupadas: number;
  en_vivo: number;
  nota_argos_hoy: number | null;
  argos: SaldoArgos;
  necesita_de_ti: number;
  admin_principal: { nombre: string; correo: string } | null;
  solo_mirar: false;
}

/** Tarjeta de afuera (Kash): solo para mirar (organizaciones_externas). */
export interface OrganizacionExterna {
  id: string;
  nombre: string;
  logo_url: string | null;
  app_url: string | null;
  resumen: {
    personas: number;
    en_vivo: number;
    nota_argos_hoy: number | null;
    argos_gastado_mes_usd: number;
    argos_saldo_usd?: number | null;
    necesita_de_ti: number;
  };
  actualizado_at: string | null;
  solo_mirar: true;
}

export interface PanelDelDueno {
  clientes: ClienteDelDueno[];
  externas: OrganizacionExterna[];
  /** false para Grace: sin precios ni cobros. */
  ve_precios: boolean;
}

export interface NuevoCliente {
  nombre: string;
  admin: { nombre: string; correo: string; idioma: "es" | "en" };
  plan: PlanOrganizacion;
  marca: MarcaOrganizacion;
  es_demo: boolean;
}

/** La lista de pendientes del cliente (ClientChecklist de Lumina, con Stripe). */
export interface PendientesDelCliente {
  estado: EstadoOrganizacion;
  lider: { user_id: string; nombre: string; correo: string; entro_at: string | null } | null;
  marca: boolean;
  plan: boolean;
  /** Tarjeta puesta en Stripe, o «sin tarjeta» marcado al crear. */
  tarjeta: boolean;
  sin_tarjeta: boolean;
  activada_at: string | null;
  primer_cobro_at: string | null;
}

export type RolDePersona = "empleado" | "supervisor" | "admin";
export type EstadoDePersona = "activa" | "invitada" | "pausada";

export interface Persona {
  user_id: string;
  nombre: string;
  correo: string;
  rol: RolDePersona;
  estado: EstadoDePersona;
  en_vivo: boolean;
  ultima_actividad: string | null;
  nota_argos: number | null;
  desde: string;
}

/** resumen_organizacion para el cliente normal (una sola agencia). */
export interface ResumenDeMiEmpresa {
  organizacion: OrganizacionBase;
  /** El tenant donde vive la gente del cliente normal. */
  tenant_id: string;
  paquete: number;
  ocupadas: number;
  en_vivo: number;
  nota_argos_hoy: number | null;
  argos: SaldoArgos;
  necesita_de_ti: number;
  /** Estado del cobro (también lo ve Grace, sin montos): bloquea si está «bloqueado». */
  estado_cobro: EstadoDeCobro;
}

export type EstadoDeCobro = "al_dia" | "prueba" | "gracia" | "bloqueado" | "sin_cobro";

export interface Factura {
  id: string;
  fecha: string;
  concepto: "plan" | "recarga_argos" | "setup";
  monto_usd: number;
  estado: "pagada" | "fallida" | "pendiente";
  url: string | null;
}

/** plan_de_organizacion: cobro null y ve_precios false para Grace. */
export interface PlanYPagos {
  plan: PlanOrganizacion | null;
  ve_precios: boolean;
  cobro: {
    estado: EstadoDeCobro;
    proximo_cobro_at: string | null;
    proximo_monto_usd: number | null;
    tarjeta: { marca: string; ultimos4: string; vence: string } | null;
    dias_prueba_restantes: number | null;
    dias_gracia_restantes: number | null;
    facturas: Factura[];
  } | null;
}

export interface EventoDelHistorial {
  id: string;
  at: string;
  actor_nombre: string | null;
  actor_tipo: "plataforma" | "cliente" | "agencia" | "sistema";
  /** Clave estable (cliente_creado, cliente_activado, persona_agregada…): la pantalla la traduce. */
  accion: string;
  detalle: Record<string, unknown>;
}

export interface AdminDePlataforma {
  user_id: string;
  nombre: string;
  correo: string;
  nivel: "dueno" | "admin";
  estado: "activa" | "invitada";
  ultimo_ingreso: string | null;
}

/** Para «Ver como → Persona»: cualquiera de cualquier cliente. */
export interface PersonaDeLaPlataforma extends Persona {
  organizacion_id: string;
  organizacion_nombre: string;
}

export interface NuevaPersona {
  nombre: string;
  correo: string;
  rol: RolDePersona;
  idioma: "es" | "en";
}

/**
 * Errores con clave estable (como los de las funciones del edificio): la
 * pantalla los traduce con t("plataforma.error.<clave>").
 */
export type ClaveDeError =
  | "sin_permiso"
  | "solo_dueno"
  | "plan_lleno"
  | "ya_existe"
  | "correo_invalido"
  | "org_en_preparacion"
  | "faltan_pendientes"
  | "cliente_bloqueado"
  | "solo_lectura"
  | "no_disponible";

export class ErrorDePlataforma extends Error {
  constructor(public clave: ClaveDeError, detalle?: string) {
    super(detalle ? `${clave}: ${detalle}` : clave);
    this.name = "ErrorDePlataforma";
  }
}

/** Lee la clave de un error de RPC («plan_lleno: …») o de ErrorDePlataforma. */
export function claveDeError(e: unknown): ClaveDeError | null {
  if (e instanceof ErrorDePlataforma) return e.clave;
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  const m = msg.match(/^([a-z_]+)(?::|$)/);
  const claves: ClaveDeError[] = ["sin_permiso", "solo_dueno", "plan_lleno", "ya_existe", "correo_invalido", "org_en_preparacion",
    "faltan_pendientes", "cliente_bloqueado", "solo_lectura", "no_disponible"];
  if (m && (claves as string[]).includes(m[1])) return m[1] as ClaveDeError;
  // El edificio dice «paquete_lleno» / «agencia_llena»: para el cliente normal es lo mismo.
  if (m && (m[1] === "paquete_lleno" || m[1] === "agencia_llena")) return "plan_lleno";
  return null;
}

/**
 * Todo lo que leen y hacen los paneles. Cada método dice qué RPC del edificio
 * usa (ver supabase.ts).
 */
export interface PlataformaDatos {
  quienSoy(): Promise<Yo>;
  // Panel del dueño
  organizacionesDelDueno(): Promise<PanelDelDueno>;
  crearOrganizacion(nuevo: NuevoCliente): Promise<string>;
  marcarComoDemo(org: string, esDemo: boolean): Promise<void>;
  pendientesDe(org: string): Promise<PendientesDelCliente>;
  activarOrganizacion(org: string): Promise<{ invitado: string }>;
  recargarArgosManual(org: string, usd: number): Promise<SaldoArgos>;
  cambiarMarca(org: string, marca: MarcaOrganizacion): Promise<void>;
  /** Manda al admin del cliente el link de Stripe para poner su tarjeta. */
  enviarLinkDeTarjeta(org: string): Promise<{ correo: string }>;
  // Panel del admin del cliente
  resumenDeMiEmpresa(org: string): Promise<ResumenDeMiEmpresa>;
  personas(org: string): Promise<Persona[]>;
  agregarPersona(org: string, nueva: NuevaPersona): Promise<Persona>;
  cambiarRol(org: string, user: string, rol: RolDePersona): Promise<void>;
  quitarPersona(org: string, user: string): Promise<void>;
  reenviarInvitacion(org: string, user: string): Promise<void>;
  historial(org: string): Promise<EventoDelHistorial[]>;
  planYPagos(org: string): Promise<PlanYPagos>;
  /** Stripe Checkout de una recarga (USD 25 → USD 50 de crédito). Devuelve a dónde ir, o el saldo si ya se acreditó. */
  iniciarRecarga(org: string): Promise<{ url: string | null; saldo?: SaldoArgos }>;
  // Equipo de Maven
  equipoMaven(): Promise<AdminDePlataforma[]>;
  agregarAdminPlataforma(nombre: string, correo: string): Promise<AdminDePlataforma>;
  quitarAdminPlataforma(user: string): Promise<void>;
  reenviarInvitacionAdmin(user: string): Promise<void>;
  // Ver como
  todasLasPersonas(): Promise<PersonaDeLaPlataforma[]>;
}
