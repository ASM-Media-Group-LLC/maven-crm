// portal-creadoras — la lógica, sin red ni Deno.serve, para poder probarla con
// dobles (logica.test.ts). index.ts le pasa los puertos de verdad.
//
// Lo usa la AGENCIA, desde el perfil de la creadora (pestaña Portal):
//   invitar        — le crea la cuenta (o usa la que ya tiene en otra agencia), la
//                    ata a su ficha y le manda el correo para elegir contraseña.
//   reenviar       — un enlace nuevo para elegir contraseña (sirve también si la
//                    olvidó y no lo pide ella).
//   cambiar_correo — el correo con el que entra.
//   quitar         — la desata de la ficha; si no le queda ninguna, la cuenta se
//                    bloquea (no se borra: si la vuelven a invitar, se desbloquea).
//
// QUIÉN: alguien del equipo (nunca una cuenta de creadora) que VE a esa creadora
// (se pregunta con su JWT: la RLS de creators decide agencia y alcance) y tiene
// el permiso «Invitar al portal» de Creadores (can_use_module_function; sin fila
// explícita en su rol, supervisor o más). Todo lo demás, con service_role y solo
// después de esas preguntas.
//
// La base pone el resto (20261006100000): la agencia sale de la ficha, solo se
// atan cuentas de creadora, una cuenta por ficha y una ficha por agencia.

export const ACCIONES = ["invitar", "reenviar", "cambiar_correo", "quitar"] as const;
export type Accion = typeof ACCIONES[number];

export interface Cuenta {
  user_id: string;
  correo: string;
  correo_visible: string;
}

/** Lo que se lee con el JWT de quien llama: la RLS decide. */
export interface ComoPersona {
  /** ¿La RLS de creators le devuelve esa creadora? */
  veCreadora(creatorId: string): Promise<boolean>;
  /** can_use_module_function(yo, 'Creadores', 'Invitar al portal', 'supervisor_or_above'). */
  puedeInvitar(): Promise<boolean>;
}

export interface Puertos {
  /** La cuenta del token (y si es de creadora), o null si no es una sesión válida. */
  persona(token: string): Promise<{ id: string; esCreadora: boolean } | null>;
  comoPersona(token: string, userId: string): ComoPersona;
  // Con service_role, SOLO después de las comprobaciones:
  agenciaDe(userId: string): Promise<string | null>;
  ficha(creatorId: string): Promise<{ tenant_id: string; nombre: string; correo: string | null } | null>;
  nombreAgencia(tenantId: string): Promise<string>;
  cuentaDeFicha(creatorId: string): Promise<Cuenta | null>;
  fichasDeCuenta(userId: string): Promise<number>;
  cuentaPorCorreo(correo: string): Promise<{ user_id: string; tipo: string; es_de_agencia: boolean } | null>;
  crearCuenta(correo: string, nombre: string): Promise<{ id: string } | { error: string }>;
  borrarCuenta(userId: string): Promise<void>;
  bloqueada(userId: string): Promise<boolean>;
  bloquear(userId: string): Promise<void>;
  desbloquear(userId: string): Promise<void>;
  atar(fila: { user_id: string; creator_id: string; correo: string; invitada_por: string }): Promise<{ error: string | null }>;
  desatar(creatorId: string): Promise<void>;
  cambiarCorreo(userId: string, creatorId: string, correo: string): Promise<{ error: string | null }>;
  /** El enlace de un solo uso para elegir contraseña (generateLink 'recovery'). */
  enlaceContrasena(correo: string): Promise<string | null>;
  enviarCorreo(c: { para: string; remitente: string; asunto: string; html: string }): Promise<{ enviado: boolean; error: string | null }>;
  anotar(creatorId: string, userId: string, accion: string, antes: string | null, despues: string | null): Promise<void>;
  appUrl: string;
}

export interface Respuesta {
  status: number;
  body: Record<string, unknown>;
}
const r = (status: number, body: Record<string, unknown>): Respuesta => ({ status, body });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

/** El correo como se guarda: minúsculas, sin espacios. null si no es un correo. */
export function normalizarCorreo(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const c = x.trim().toLowerCase();
  return c.length <= 254 && CORREO.test(c) ? c : null;
}

/** «s•••@gmail.com», igual que mask_email de la base. */
export function ocultarCorreo(c: string): string {
  const at = c.indexOf("@");
  return at < 0 ? "••••" : `${c.slice(0, 1)}•••${c.slice(at)}`;
}

/** Texto para meter en HTML. */
export function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** El nombre que va en el «De:» del correo: sin lo que rompe la cabecera. */
export function remitente(agencia: string, correoDeSalida: string): string {
  const limpio = agencia.replace(/[<>"\r\n,;]/g, "").trim().slice(0, 60) || "Maven";
  const direccion = correoDeSalida.match(/<([^>]+)>/)?.[1] ?? correoDeSalida;
  return `${limpio} vía Maven <${direccion}>`;
}

// ─── Los correos ─────────────────────────────────────────────────────────────
// En español (las creadoras de hoy hablan español) y de tú. El botón lleva a
// /reset-password: ahí la página reconoce la cuenta de creadora y la manda a
// elegir su contraseña en el portal.
type Plantilla = "bienvenida" | "otra_agencia" | "enlace" | "correo_nuevo";

export function correo(
  tipo: Plantilla,
  datos: { nombre: string; agencia: string; enlace: string; appUrl: string },
): { asunto: string; html: string } {
  const nombre = escapar(datos.nombre);
  const agencia = escapar(datos.agencia);
  const entrar = `${datos.appUrl}/portal/entrar`;
  const textos: Record<Plantilla, { asunto: string; titulo: string; cuerpo: string; boton: string; pie: string }> = {
    bienvenida: {
      asunto: `${datos.agencia} te invitó a tu espacio en Maven`,
      titulo: "Tu espacio en Maven",
      cuerpo: `${agencia} te creó un acceso a Maven. Ahí ves y completas tu ficha, para que el equipo escriba como tú. Muy pronto vas a poder subir tu contenido y ver tus pedidos desde el mismo lugar.`,
      boton: "Elegir mi contraseña",
      pie: `El botón vence en 1 hora. Si vence, entra a <a href="${entrar}" style="color:#6366f1;">${entrar}</a> y toca «¿Olvidaste tu contraseña?».`,
    },
    otra_agencia: {
      asunto: `${datos.agencia} te sumó a tu espacio en Maven`,
      titulo: "Una agencia más en tu espacio",
      cuerpo: `${agencia} también trabaja contigo en Maven. Entras con el mismo correo y la misma contraseña de siempre, y en tu inicio eliges con qué agencia estás trabajando. Cada agencia solo ve lo suyo.`,
      boton: "Entrar",
      pie: "Si no reconoces esta agencia, avísale a tu agencia de siempre.",
    },
    enlace: {
      asunto: "Tu enlace para entrar a Maven",
      titulo: "Elige tu contraseña",
      cuerpo: `${agencia} te mandó un enlace para que elijas una contraseña nueva para tu espacio en Maven.`,
      boton: "Elegir mi contraseña",
      pie: `El botón vence en 1 hora. Si vence, entra a <a href="${entrar}" style="color:#6366f1;">${entrar}</a> y toca «¿Olvidaste tu contraseña?».`,
    },
    correo_nuevo: {
      asunto: "Tu correo para entrar a Maven cambió",
      titulo: "Ahora entras con este correo",
      cuerpo: `${agencia} cambió el correo con el que entras a tu espacio en Maven: desde ahora es este. Elige una contraseña para entrar.`,
      boton: "Elegir mi contraseña",
      pie: "El botón vence en 1 hora. Si no esperabas este cambio, avísale a tu agencia.",
    },
  };
  const t = textos[tipo];
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:28px 24px;color:#ffffff;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">${agencia} · Maven</div>
    <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">${t.titulo}</h1>
  </div>
  <div style="padding:24px;">
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">${nombre ? `Hola, <strong>${nombre}</strong>:` : "Hola:"}</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">${t.cuerpo}</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${escapar(datos.enlace)}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4338ca);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:9999px;">${t.boton}</a>
    </div>
    <p style="color:#6b7280;font-size:12px;line-height:1.55;margin:14px 0 0;">${t.pie}</p>
    <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin:18px 0 0;word-break:break-all;">¿No funciona el botón? Copia este enlace en tu navegador:<br/><span style="color:#6366f1;">${escapar(datos.enlace)}</span></p>
  </div>
  <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="color:#9ca3af;font-size:11px;margin:0;">Enviado por Maven a pedido de ${agencia}. No respondas a este correo.</p>
  </div>
</div>`;
  return { asunto: t.asunto, html };
}

// ─── El manejador ────────────────────────────────────────────────────────────
export async function manejar(token: string, body: Record<string, unknown>, p: Puertos & { salida: string }): Promise<Respuesta> {
  if (!token) return r(401, { error: "sin_sesion" });
  const yo = await p.persona(token);
  if (!yo) return r(401, { error: "sin_sesion" });
  if (yo.esCreadora) return r(403, { error: "solo_equipo" });

  const accion = body.accion as Accion;
  if (!ACCIONES.includes(accion)) return r(400, { error: "accion_desconocida" });
  const creatorId = typeof body.creator_id === "string" && UUID.test(body.creator_id) ? body.creator_id : null;
  if (!creatorId) return r(400, { error: "creator_id_invalido" });

  // Quién: ve a la creadora (su agencia y su alcance) y tiene el permiso.
  const cp = p.comoPersona(token, yo.id);
  if (!(await cp.veCreadora(creatorId))) return r(404, { error: "no_existe" });
  if (!(await cp.puedeInvitar())) return r(403, { error: "sin_permiso" });
  const ficha = await p.ficha(creatorId);
  const miAgencia = await p.agenciaDe(yo.id);
  if (!ficha || !miAgencia || ficha.tenant_id !== miAgencia) return r(404, { error: "no_existe" });
  const agencia = await p.nombreAgencia(ficha.tenant_id);

  const mandar = async (para: string, tipo: Plantilla, enlace: string | null) => {
    if (!enlace) return { enviado: false, error: "sin_enlace" };
    const c = correo(tipo, { nombre: ficha.nombre, agencia, enlace, appUrl: p.appUrl });
    return await p.enviarCorreo({ para, remitente: remitente(agencia, p.salida), asunto: c.asunto, html: c.html });
  };
  const cuenta = await p.cuentaDeFicha(creatorId);

  if (accion === "invitar") {
    if (cuenta) return r(409, { error: "ya_tiene_acceso" });
    const elegido = body.correo == null || body.correo === "" ? ficha.correo : body.correo;
    const correoNuevo = normalizarCorreo(elegido);
    if (!correoNuevo) return r(400, { error: elegido ? "correo_invalido" : "sin_correo" });

    const existente = await p.cuentaPorCorreo(correoNuevo);
    if (existente && (existente.tipo !== "creadora" || existente.es_de_agencia)) {
      // Es de alguien del equipo (de esta u otra agencia): nunca se ata a una ficha.
      return r(409, { error: "correo_de_equipo" });
    }
    let userId: string;
    let nueva = false;
    if (existente) {
      userId = existente.user_id;
      if (await p.bloqueada(userId)) await p.desbloquear(userId);
    } else {
      const creada = await p.crearCuenta(correoNuevo, ficha.nombre);
      if ("error" in creada) return r(502, { error: "no_se_creo_la_cuenta", detalle: creada.error });
      userId = creada.id;
      nueva = true;
    }
    const atada = await p.atar({ user_id: userId, creator_id: creatorId, correo: correoNuevo, invitada_por: yo.id });
    if (atada.error) {
      if (nueva) await p.borrarCuenta(userId);
      const codigo = /misma agencia/.test(atada.error) ? "correo_de_otra_creadora"
        : /una_por_ficha|duplicate key/.test(atada.error) ? "ya_tiene_acceso"
        : "no_se_ato";
      return r(409, { error: codigo });
    }
    const envio = nueva || (await p.fichasDeCuenta(userId)) <= 1
      ? await mandar(correoNuevo, "bienvenida", await p.enlaceContrasena(correoNuevo))
      : await mandar(correoNuevo, "otra_agencia", `${p.appUrl}/portal/entrar`);
    await p.anotar(creatorId, yo.id, "portal_acceso:invitada", null, ocultarCorreo(correoNuevo));
    return r(200, { ok: true, correo_visible: ocultarCorreo(correoNuevo), ya_tenia_cuenta: !nueva, correo_enviado: envio.enviado, correo_error: envio.error });
  }

  if (!cuenta) return r(404, { error: "sin_acceso" });

  if (accion === "reenviar") {
    const envio = await mandar(cuenta.correo, "enlace", await p.enlaceContrasena(cuenta.correo));
    await p.anotar(creatorId, yo.id, "portal_acceso:enlace", null, cuenta.correo_visible);
    return r(200, { ok: true, correo_visible: cuenta.correo_visible, correo_enviado: envio.enviado, correo_error: envio.error });
  }

  if (accion === "cambiar_correo") {
    const correoNuevo = normalizarCorreo(body.correo);
    if (!correoNuevo) return r(400, { error: "correo_invalido" });
    if (correoNuevo === cuenta.correo) return r(200, { ok: true, correo_visible: cuenta.correo_visible, sin_cambios: true });
    // Si trabaja con otra agencia, su correo no lo cambia una sola: es de las dos.
    if ((await p.fichasDeCuenta(cuenta.user_id)) > 1) return r(409, { error: "cuenta_compartida" });
    const otra = await p.cuentaPorCorreo(correoNuevo);
    if (otra && otra.user_id !== cuenta.user_id) return r(409, { error: "correo_en_uso" });
    const cambio = await p.cambiarCorreo(cuenta.user_id, creatorId, correoNuevo);
    if (cambio.error) return r(502, { error: "no_se_cambio", detalle: cambio.error });
    const envio = await mandar(correoNuevo, "correo_nuevo", await p.enlaceContrasena(correoNuevo));
    await p.anotar(creatorId, yo.id, "portal_acceso:correo", cuenta.correo_visible, ocultarCorreo(correoNuevo));
    return r(200, { ok: true, correo_visible: ocultarCorreo(correoNuevo), correo_enviado: envio.enviado, correo_error: envio.error });
  }

  // quitar
  await p.desatar(creatorId);
  const quedan = await p.fichasDeCuenta(cuenta.user_id);
  if (quedan === 0) await p.bloquear(cuenta.user_id);
  await p.anotar(creatorId, yo.id, "portal_acceso:quitada", cuenta.correo_visible, null);
  return r(200, { ok: true, cuenta_bloqueada: quedan === 0 });
}
