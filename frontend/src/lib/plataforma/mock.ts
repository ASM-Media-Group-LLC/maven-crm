import { PLANES, RECARGA_RECIBES_USD, correoValido, planVisible } from "./planes";
import {
  ErrorDePlataforma,
  type AdminDePlataforma,
  type ClienteDelDueno,
  type EstadoDeCobro,
  type EventoDelHistorial,
  type Factura,
  type NuevaPersona,
  type NuevoCliente,
  type OrganizacionBase,
  type OrganizacionExterna,
  type Persona,
  type PersonaDeLaPlataforma,
  type PlataformaDatos,
  type PlanYPagos,
  type RolDePersona,
  type TipoDeYo,
  type Yo,
} from "./tipos";

// DATOS DE EJEMPLO DE LA PLATAFORMA (tanda 6: «construir todo ya SIN gastar en
// Supabase; el día del cliente solo se enciende»). Todo vive en memoria: no
// toca Kash ni el edificio. Se usa solo con la bandera (ver index.ts).
//
// Tres clientes del edificio + Kash como tarjeta de afuera:
//   · Nova Studio  — cliente activo, plan Empresa, 18 personas, todo al día.
//   · Atlas Dental — cliente activo, plan Equipo LLENO (20/20), pago fallido
//                    (en gracia) y Argos sin saldo: el que «necesita de ti».
//   · Cliente Demo — demo en preparación (corp@asmtech.me), sin invitar aún.
//   · KA$H Group   — la cuenta principal, solo para mirar.

const DIA = 86_400_000;
const hace = (ms: number) => new Date(Date.now() - ms).toISOString();
const dentro = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Un logo de ejemplo (SVG en línea) para las tarjetas. */
export function logoDeEjemplo(texto: string, color: string, fondo = "transparent"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="72" viewBox="0 0 240 72">` +
    `<rect width="240" height="72" rx="14" fill="${fondo}"/>` +
    `<circle cx="36" cy="36" r="18" fill="${color}"/><circle cx="36" cy="36" r="8" fill="#fff" fill-opacity=".85"/>` +
    `<text x="66" y="46" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700" fill="#fff">${texto}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const IDENTIDADES: Record<TipoDeYo, Yo> = {
  dueno: { user_id: "u-dueno", nombre: "Alvaro Mejía", correo: "rusin24@gmail.com", tipo: "dueno" },
  admin_plataforma: { user_id: "u-grace", nombre: "Grace Gelves", correo: "grace@maven-ai.me", tipo: "admin_plataforma" },
  admin_cliente: { user_id: "nova-1", nombre: "Laura Gómez", correo: "laura.gomez@novastudio.co", tipo: "admin_cliente", organizacion_id: "org-nova" },
};

interface OrgMock {
  base: OrganizacionBase;
  admins: { user_id: string; principal: boolean }[];
  personas: Persona[];
  argos: { saldo_usd: number; pausado: boolean };
  cobro: NonNullable<PlanYPagos["cobro"]>;
  activada_at: string | null;
  admin_entro_at: string | null;
  historial: EventoDelHistorial[];
  /** Personas a la espera de su invitación hasta que se active. */
  invitacion_pendiente: string | null;
}

const NOMBRES_NOVA = [
  "Laura Gómez", "Daniel Ortiz", "Camila Reyes", "Mateo Herrera", "Sofía Castro", "Andrés Molina",
  "Valentina Ríos", "Julián Vargas", "Isabella Mora", "Santiago Peña", "Mariana Salazar", "Tomás Rojas",
  "Lucía Navarro", "Samuel Duarte", "Gabriela Pardo", "Nicolás Cifuentes", "Paula Medina", "Emilio Arango",
];
const NOMBRES_ATLAS = [
  "Ricardo Fuentes", "Ana Beltrán", "Diego Suárez", "Carolina León", "Felipe Acosta", "Natalia Cruz",
  "Sebastián Gil", "Daniela Marín", "Juan Pablo Ochoa", "Laura Cárdenas", "Miguel Torres", "Elena Prieto",
  "Óscar Lozano", "Manuela Franco", "Iván Restrepo", "Catalina Soto", "Hugo Barrera", "Adriana Mejía",
  "Esteban Quintero", "Verónica Lara",
];

const correoDe = (nombre: string, dominio: string) =>
  nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".") + "@" + dominio;

function armarPersonas(prefijo: string, nombres: string[], dominio: string, opciones: { invitadas?: number; vivos: number }): Persona[] {
  return nombres.map((nombre, i) => {
    const rol: RolDePersona = i === 0 ? "admin" : i <= 2 ? "supervisor" : "empleado";
    const invitada = i >= nombres.length - (opciones.invitadas ?? 0);
    const en_vivo = !invitada && i < opciones.vivos;
    return {
      user_id: `${prefijo}-${i + 1}`,
      nombre,
      correo: correoDe(nombre, dominio),
      rol,
      estado: invitada ? "invitada" : "activa",
      en_vivo,
      ultima_actividad: invitada ? null : hace(en_vivo ? 60_000 * (i + 1) : DIA * ((i % 4) + 1) / 3),
      nota_argos: invitada || rol === "admin" ? null : 58 + ((i * 13) % 38),
      desde: hace(DIA * (40 - i)),
    };
  });
}

function facturasPagadas(meses: number, monto: number): Factura[] {
  return Array.from({ length: meses }, (_, i) => ({
    id: `fac-${monto}-${i}`,
    fecha: hace(DIA * 30 * (i + 1) - DIA * 2),
    concepto: "plan" as const,
    monto_usd: monto,
    estado: "pagada" as const,
    url: "#",
  }));
}

function semilla(): { orgs: Map<string, OrgMock>; externas: OrganizacionExterna[]; equipo: AdminDePlataforma[] } {
  const orgs = new Map<string, OrgMock>();

  const nova: OrgMock = {
    base: {
      id: "org-nova", nombre: "Nova Studio", slug: "nova-studio", tipo: "normal", estado: "activa", es_demo: false,
      plan: { ...PLANES.empresa, setup_usd: 3000 },
      marca: { nombre: "Nova Studio", logo_url: logoDeEjemplo("Nova Studio", "#38bdf8"), color: "#1d4ed8" },
    },
    admins: [{ user_id: "nova-1", principal: true }],
    personas: armarPersonas("nova", NOMBRES_NOVA, "novastudio.co", { invitadas: 1, vivos: 11 }),
    argos: { saldo_usd: 37.5, pausado: false },
    cobro: {
      estado: "al_dia", proximo_cobro_at: dentro(DIA * 12), proximo_monto_usd: 599,
      tarjeta: { marca: "Visa", ultimos4: "4242", vence: "08/28" },
      dias_prueba_restantes: null, dias_gracia_restantes: null,
      facturas: [
        { id: "fac-nova-r1", fecha: hace(DIA * 6), concepto: "recarga_argos", monto_usd: 25, estado: "pagada", url: "#" },
        ...facturasPagadas(3, 599),
        { id: "fac-nova-setup", fecha: hace(DIA * 95), concepto: "setup", monto_usd: 3000, estado: "pagada", url: "#" },
      ],
    },
    activada_at: hace(DIA * 96), admin_entro_at: hace(DIA * 95),
    historial: [
      { id: "h1", at: hace(DIA * 97), actor_nombre: "Alvaro Mejía", actor_tipo: "plataforma", accion: "cliente_creado", detalle: {} },
      { id: "h2", at: hace(DIA * 96), actor_nombre: "Alvaro Mejía", actor_tipo: "plataforma", accion: "cliente_activado", detalle: {} },
      { id: "h3", at: hace(DIA * 30), actor_nombre: "Laura Gómez", actor_tipo: "cliente", accion: "persona_agregada", detalle: { nombre: "Emilio Arango" } },
      { id: "h4", at: hace(DIA * 6), actor_nombre: "Laura Gómez", actor_tipo: "cliente", accion: "argos_recargado", detalle: { usd: 50 } },
      { id: "h5", at: hace(DIA * 2), actor_nombre: "Laura Gómez", actor_tipo: "cliente", accion: "rol_cambiado", detalle: { nombre: "Camila Reyes", rol: "supervisor" } },
    ],
    invitacion_pendiente: null,
  };

  const atlas: OrgMock = {
    base: {
      id: "org-atlas", nombre: "Atlas Dental", slug: "atlas-dental", tipo: "normal", estado: "activa", es_demo: false,
      plan: { ...PLANES.equipo, setup_usd: 3000 },
      marca: { nombre: "Atlas Dental", logo_url: logoDeEjemplo("Atlas Dental", "#2dd4bf"), color: "#0f766e" },
    },
    admins: [{ user_id: "atlas-1", principal: true }],
    personas: armarPersonas("atlas", NOMBRES_ATLAS, "atlasdental.com", { vivos: 9 }),
    argos: { saldo_usd: 0, pausado: true },
    cobro: {
      estado: "gracia", proximo_cobro_at: hace(DIA * 2), proximo_monto_usd: 299,
      tarjeta: { marca: "Mastercard", ultimos4: "5100", vence: "10/26" },
      dias_prueba_restantes: null, dias_gracia_restantes: 5,
      facturas: [
        { id: "fac-atlas-f", fecha: hace(DIA * 2), concepto: "plan", monto_usd: 299, estado: "fallida", url: null },
        ...facturasPagadas(2, 299),
      ],
    },
    activada_at: hace(DIA * 64), admin_entro_at: hace(DIA * 63),
    historial: [
      { id: "a1", at: hace(DIA * 65), actor_nombre: "Grace Gelves", actor_tipo: "plataforma", accion: "cliente_creado", detalle: {} },
      { id: "a2", at: hace(DIA * 64), actor_nombre: "Alvaro Mejía", actor_tipo: "plataforma", accion: "cliente_activado", detalle: {} },
      { id: "a3", at: hace(DIA * 3), actor_nombre: null, actor_tipo: "sistema", accion: "argos_pausado", detalle: {} },
      { id: "a4", at: hace(DIA * 2), actor_nombre: null, actor_tipo: "sistema", accion: "cobro_fallido", detalle: { usd: 299 } },
    ],
    invitacion_pendiente: null,
  };

  const demo: OrgMock = {
    base: {
      id: "org-demo", nombre: "Cliente Demo", slug: "cliente-demo", tipo: "normal", estado: "preparacion", es_demo: true,
      plan: { ...PLANES.equipo, dias_gratis: 30, sin_tarjeta: true, sin_setup: true },
      marca: { nombre: "Cliente Demo", logo_url: null, color: "#6b7280" },
    },
    admins: [{ user_id: "demo-1", principal: true }],
    personas: [{
      user_id: "demo-1", nombre: "Equipo ASM", correo: "corp@asmtech.me", rol: "admin", estado: "invitada",
      en_vivo: false, ultima_actividad: null, nota_argos: null, desde: hace(DIA),
    }],
    argos: { saldo_usd: 0, pausado: true },
    cobro: {
      estado: "sin_cobro", proximo_cobro_at: null, proximo_monto_usd: null, tarjeta: null,
      dias_prueba_restantes: 30, dias_gracia_restantes: null, facturas: [],
    },
    activada_at: null, admin_entro_at: null,
    historial: [
      { id: "d1", at: hace(DIA), actor_nombre: "Alvaro Mejía", actor_tipo: "plataforma", accion: "cliente_creado", detalle: {} },
    ],
    invitacion_pendiente: "corp@asmtech.me",
  };

  for (const o of [nova, atlas, demo]) orgs.set(o.base.id, o);

  const externas: OrganizacionExterna[] = [{
    id: "ext-kash", nombre: "KA$H Group", logo_url: logoDeEjemplo("KA$H", "#ef4444", "#111827"),
    // TODO(vagón 2): la puerta única decide a dónde lleva «Entrar» (app de computador o app.maven-ai.me).
    app_url: "https://app.maven-ai.me/dashboard",
    resumen: { personas: 54, en_vivo: 33, nota_argos_hoy: 78, argos_gastado_mes_usd: 212.4, argos_saldo_usd: null, necesita_de_ti: 3 },
    actualizado_at: hace(4 * 60_000), solo_mirar: true,
  }];

  const equipo: AdminDePlataforma[] = [
    { user_id: "u-dueno", nombre: "Alvaro Mejía", correo: "rusin24@gmail.com", nivel: "dueno", estado: "activa", ultimo_ingreso: hace(60_000 * 3) },
    { user_id: "u-grace", nombre: "Grace Gelves", correo: "grace@maven-ai.me", nivel: "admin", estado: "activa", ultimo_ingreso: hace(DIA / 2) },
  ];

  return { orgs, externas, equipo };
}

const espera = (ms = 140) => new Promise((r) => setTimeout(r, ms));
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const CLAVE_IDENTIDAD_MOCK = "maven.plataforma.mock.yo";

/** Crea una plataforma de ejemplo. `identidad` se puede cambiar en vivo (barra de la demo). */
export function crearPlataformaMock(opciones: { identidad?: () => TipoDeYo; latencia?: number } = {}): PlataformaDatos & { reiniciar(): void } {
  let estado = semilla();
  const lat = opciones.latencia ?? 140;
  const yo = (): Yo => IDENTIDADES[opciones.identidad?.() ?? "dueno"];
  const esPlataforma = () => yo().tipo !== "admin_cliente";
  const esDueno = () => yo().tipo === "dueno";
  let secuencia = 100;
  const nuevoId = (p: string) => `${p}-${++secuencia}`;

  const org = (id: string): OrgMock => {
    const o = estado.orgs.get(id);
    if (!o) throw new ErrorDePlataforma("sin_permiso", "cliente_no_existe");
    const y = yo();
    if (y.tipo === "admin_cliente" && y.organizacion_id !== id) throw new ErrorDePlataforma("sin_permiso");
    return o;
  };
  const anotar = (o: OrgMock, accion: string, detalle: Record<string, unknown> = {}) => {
    const y = yo();
    o.historial.unshift({
      id: nuevoId("h"), at: new Date().toISOString(), actor_nombre: y.nombre,
      actor_tipo: y.tipo === "admin_cliente" ? "cliente" : "plataforma", accion, detalle,
    });
  };
  const ocupadas = (o: OrgMock) => o.personas.length;
  const enVivo = (o: OrgMock) => o.personas.filter((p) => p.en_vivo).length;
  const notaHoy = (o: OrgMock) => {
    const n = o.personas.map((p) => p.nota_argos).filter((x): x is number => typeof x === "number");
    return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null;
  };
  const necesita = (o: OrgMock) => {
    if (o.base.estado === "preparacion") return 1;
    return (o.argos.pausado ? 1 : 0) + (ocupadas(o) >= (o.base.plan?.personas ?? 0) ? 1 : 0)
      + (o.cobro.estado === "gracia" || o.cobro.estado === "bloqueado" ? 1 : 0);
  };
  const estadoCobro = (o: OrgMock): EstadoDeCobro => o.cobro.estado;

  const api: PlataformaDatos & { reiniciar(): void } = {
    reiniciar() { estado = semilla(); },

    async quienSoy() { await espera(lat / 3); return copia(yo()); },

    async organizacionesDelDueno() {
      await espera(lat);
      if (!esPlataforma()) throw new ErrorDePlataforma("sin_permiso");
      const conPrecios = esDueno();
      const clientes: ClienteDelDueno[] = [...estado.orgs.values()]
        .sort((a, b) => Number(a.base.es_demo) - Number(b.base.es_demo))
        .map((o) => {
          const principal = o.admins.find((a) => a.principal);
          const p = principal ? o.personas.find((x) => x.user_id === principal.user_id) : null;
          return {
            id: o.base.id,
            organizacion: { ...copia(o.base), plan: planVisible(copia(o.base.plan), conPrecios) },
            paquete: o.base.plan?.personas ?? 0,
            ocupadas: ocupadas(o),
            en_vivo: enVivo(o),
            nota_argos_hoy: notaHoy(o),
            argos: { ...o.argos, argos_usd_mes: conPrecios ? o.base.plan?.argos_usd_mes ?? null : null },
            necesita_de_ti: necesita(o),
            admin_principal: p ? { nombre: p.nombre, correo: p.correo } : null,
            solo_mirar: false,
          };
        });
      return { clientes, externas: copia(estado.externas), ve_precios: conPrecios };
    },

    async crearOrganizacion(nuevo: NuevoCliente) {
      await espera(lat * 2);
      if (!esPlataforma()) throw new ErrorDePlataforma("sin_permiso");
      // Como crear_organizacion: Grace solo pone el nombre del plan y las personas.
      const { nombre: _n, personas: _p, ...conPrecio } = nuevo.plan;
      if (!esDueno() && Object.keys(conPrecio).length > 0) throw new ErrorDePlataforma("solo_dueno");
      if (!correoValido(nuevo.admin.correo)) throw new ErrorDePlataforma("correo_invalido");
      const nombre = nuevo.nombre.trim();
      if ([...estado.orgs.values()].some((o) => o.base.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new ErrorDePlataforma("ya_existe");
      }
      const id = nuevoId("org");
      const adminId = nuevoId("u");
      const o: OrgMock = {
        base: {
          id, nombre, slug: nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-"), tipo: "normal", estado: "preparacion",
          es_demo: nuevo.es_demo, plan: copia(nuevo.plan), marca: copia(nuevo.marca),
        },
        admins: [{ user_id: adminId, principal: true }],
        personas: [{
          user_id: adminId, nombre: nuevo.admin.nombre.trim(), correo: nuevo.admin.correo.trim().toLowerCase(), rol: "admin",
          estado: "invitada", en_vivo: false, ultima_actividad: null, nota_argos: null, desde: new Date().toISOString(),
        }],
        argos: { saldo_usd: 0, pausado: true },
        cobro: {
          estado: "sin_cobro", proximo_cobro_at: null, proximo_monto_usd: null, tarjeta: null,
          dias_prueba_restantes: nuevo.plan.dias_gratis ?? null, dias_gracia_restantes: null, facturas: [],
        },
        activada_at: null, admin_entro_at: null, historial: [], invitacion_pendiente: nuevo.admin.correo.trim().toLowerCase(),
      };
      estado.orgs.set(id, o);
      anotar(o, "cliente_creado", { nombre });
      return id;
    },

    async marcarComoDemo(id, esDemo) {
      await espera(lat);
      if (!esPlataforma()) throw new ErrorDePlataforma("sin_permiso");
      const o = org(id);
      o.base.es_demo = esDemo;
      anotar(o, esDemo ? "pasado_a_demo" : "marcado_cliente");
    },

    async pendientesDe(id) {
      await espera(lat);
      if (!esPlataforma()) throw new ErrorDePlataforma("sin_permiso");
      const o = org(id);
      const principal = o.admins.find((a) => a.principal);
      const p = principal ? o.personas.find((x) => x.user_id === principal.user_id) : null;
      const pagada = o.cobro.facturas.find((f) => f.concepto === "plan" && f.estado === "pagada");
      return {
        estado: o.base.estado,
        lider: p ? { user_id: p.user_id, nombre: p.nombre, correo: p.correo, entro_at: o.admin_entro_at } : null,
        marca: !!(o.base.marca.nombre && o.base.marca.logo_url),
        plan: (o.base.plan?.personas ?? 0) > 0,
        tarjeta: !!o.cobro.tarjeta || !!o.base.plan?.sin_tarjeta,
        sin_tarjeta: !!o.base.plan?.sin_tarjeta,
        activada_at: o.activada_at,
        primer_cobro_at: pagada?.fecha ?? null,
      };
    },

    async activarOrganizacion(id) {
      await espera(lat * 2);
      if (!esPlataforma()) throw new ErrorDePlataforma("sin_permiso");
      const o = org(id);
      const faltan = [!o.admins.length && "lider", !(o.base.plan?.personas ?? 0) && "paquete"].filter(Boolean);
      if (faltan.length) throw new ErrorDePlataforma("faltan_pendientes", faltan.join(", "));
      o.base.estado = "activa";
      o.activada_at = new Date().toISOString();
      if (o.base.plan?.argos_usd_mes) { o.argos = { saldo_usd: o.base.plan.argos_usd_mes, pausado: false }; }
      else if (o.base.plan) {
        const credito = o.base.plan.nombre === "empresa" ? PLANES.empresa.argos_usd_mes : PLANES.equipo.argos_usd_mes;
        o.argos = { saldo_usd: credito, pausado: false };
      }
      if (o.cobro.dias_prueba_restantes) o.cobro.estado = "prueba";
      const invitado = o.invitacion_pendiente ?? "";
      o.invitacion_pendiente = null;
      anotar(o, "cliente_activado");
      if (invitado) anotar(o, "invitacion_mandada", { correo: invitado });
      return { invitado };
    },

    async recargarArgosManual(id, usd) {
      await espera(lat);
      if (!esDueno()) throw new ErrorDePlataforma("solo_dueno");
      const o = org(id);
      o.argos.saldo_usd = Math.round((o.argos.saldo_usd + usd) * 100) / 100;
      o.argos.pausado = o.argos.saldo_usd <= 0;
      anotar(o, "argos_recargado", { usd });
      return { ...o.argos, argos_usd_mes: o.base.plan?.argos_usd_mes ?? null };
    },

    async cambiarMarca(id, marca) {
      await espera(lat);
      const o = org(id);
      o.base.marca = { ...o.base.marca, ...copia(marca) };
      anotar(o, "marca_cambiada");
    },

    async enviarLinkDeTarjeta(id) {
      await espera(lat);
      if (!esDueno()) throw new ErrorDePlataforma("solo_dueno");
      const o = org(id);
      const principal = o.admins.find((a) => a.principal);
      const correo = o.personas.find((x) => x.user_id === principal?.user_id)?.correo ?? "";
      anotar(o, "link_de_tarjeta_enviado", { correo });
      return { correo };
    },

    async resumenDeMiEmpresa(id) {
      await espera(lat);
      const o = org(id);
      const conPrecios = yo().tipo !== "admin_plataforma";
      return {
        organizacion: { ...copia(o.base), plan: planVisible(copia(o.base.plan), conPrecios) },
        tenant_id: `tenant-${o.base.id}`,
        paquete: o.base.plan?.personas ?? 0,
        ocupadas: ocupadas(o),
        en_vivo: enVivo(o),
        nota_argos_hoy: notaHoy(o),
        argos: { ...o.argos, argos_usd_mes: conPrecios ? o.base.plan?.argos_usd_mes ?? null : null },
        necesita_de_ti: necesita(o),
        estado_cobro: estadoCobro(o),
      };
    },

    async personas(id) { await espera(lat); return copia(org(id).personas); },

    async agregarPersona(id, nueva: NuevaPersona) {
      await espera(lat * 2);
      const o = org(id);
      if (!correoValido(nueva.correo)) throw new ErrorDePlataforma("correo_invalido");
      if (o.base.estado === "preparacion") throw new ErrorDePlataforma("org_en_preparacion");
      if (o.cobro.estado === "bloqueado") throw new ErrorDePlataforma("cliente_bloqueado");
      if (ocupadas(o) >= (o.base.plan?.personas ?? 0)) throw new ErrorDePlataforma("plan_lleno");
      const correo = nueva.correo.trim().toLowerCase();
      for (const otra of estado.orgs.values()) {
        if (otra.personas.some((p) => p.correo === correo)) throw new ErrorDePlataforma("ya_existe");
      }
      const p: Persona = {
        user_id: nuevoId(o.base.id), nombre: nueva.nombre.trim(), correo, rol: nueva.rol, estado: "invitada",
        en_vivo: false, ultima_actividad: null, nota_argos: null, desde: new Date().toISOString(),
      };
      o.personas.push(p);
      anotar(o, "persona_agregada", { nombre: p.nombre });
      return copia(p);
    },

    async cambiarRol(id, user, rol) {
      await espera(lat);
      const o = org(id);
      const p = o.personas.find((x) => x.user_id === user);
      if (!p) throw new ErrorDePlataforma("sin_permiso");
      p.rol = rol;
      anotar(o, "rol_cambiado", { nombre: p.nombre, rol });
    },

    async quitarPersona(id, user) {
      await espera(lat);
      const o = org(id);
      const p = o.personas.find((x) => x.user_id === user);
      if (!p) return;
      if (o.admins.some((a) => a.user_id === user && a.principal)) throw new ErrorDePlataforma("sin_permiso", "admin_principal");
      o.personas = o.personas.filter((x) => x.user_id !== user);
      anotar(o, "persona_quitada", { nombre: p.nombre });
    },

    async reenviarInvitacion(id, user) {
      await espera(lat);
      const o = org(id);
      if (o.base.estado === "preparacion") throw new ErrorDePlataforma("org_en_preparacion");
      const p = o.personas.find((x) => x.user_id === user);
      if (p) anotar(o, "invitacion_mandada", { correo: p.correo });
    },

    async historial(id) { await espera(lat); return copia(org(id).historial); },

    async planYPagos(id) {
      await espera(lat);
      const o = org(id);
      const completo = yo().tipo !== "admin_plataforma";
      return {
        plan: planVisible(copia(o.base.plan), completo),
        ve_precios: completo,
        cobro: completo ? copia(o.cobro) : null,
      };
    },

    async iniciarRecarga(id) {
      await espera(lat * 2);
      if (yo().tipo === "admin_plataforma") throw new ErrorDePlataforma("solo_dueno");
      const o = org(id);
      // En la demo se acredita al instante. En el edificio: Stripe Checkout (USD 25) y
      // el webhook llama argos_acreditar(org, null, 'recarga', 50).
      o.argos.saldo_usd = Math.round((o.argos.saldo_usd + RECARGA_RECIBES_USD) * 100) / 100;
      o.argos.pausado = false;
      o.cobro.facturas.unshift({ id: nuevoId("fac"), fecha: new Date().toISOString(), concepto: "recarga_argos", monto_usd: 25, estado: "pagada", url: "#" });
      anotar(o, "argos_recargado", { usd: RECARGA_RECIBES_USD });
      return { url: null, saldo: { ...o.argos, argos_usd_mes: o.base.plan?.argos_usd_mes ?? null } };
    },

    async equipoMaven() {
      await espera(lat);
      if (!esPlataforma()) throw new ErrorDePlataforma("sin_permiso");
      return copia(estado.equipo);
    },

    async agregarAdminPlataforma(nombre, correo) {
      await espera(lat);
      if (!esDueno()) throw new ErrorDePlataforma("solo_dueno");
      if (!correoValido(correo)) throw new ErrorDePlataforma("correo_invalido");
      const c = correo.trim().toLowerCase();
      if (estado.equipo.some((a) => a.correo === c)) throw new ErrorDePlataforma("ya_existe");
      const a: AdminDePlataforma = { user_id: nuevoId("u"), nombre: nombre.trim(), correo: c, nivel: "admin", estado: "invitada", ultimo_ingreso: null };
      estado.equipo.push(a);
      return copia(a);
    },

    async quitarAdminPlataforma(user) {
      await espera(lat);
      if (!esDueno()) throw new ErrorDePlataforma("solo_dueno");
      if (estado.equipo.find((a) => a.user_id === user)?.nivel === "dueno") throw new ErrorDePlataforma("sin_permiso");
      estado.equipo = estado.equipo.filter((a) => a.user_id !== user);
    },

    async reenviarInvitacionAdmin(_user) {
      await espera(lat);
      if (!esDueno()) throw new ErrorDePlataforma("solo_dueno");
    },

    async todasLasPersonas() {
      await espera(lat);
      if (!esPlataforma()) throw new ErrorDePlataforma("sin_permiso");
      const r: PersonaDeLaPlataforma[] = [];
      for (const o of estado.orgs.values()) {
        for (const p of o.personas) r.push({ ...copia(p), organizacion_id: o.base.id, organizacion_nombre: o.base.nombre });
      }
      return r;
    },
  };
  return api;
}
