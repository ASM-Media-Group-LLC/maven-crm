/** Lector de invitaciones de calendario (iCalendar / .ics).
 *
 *  El 9,6% de los adjuntos del correo del equipo son invitaciones y hasta ahora
 *  no se podían ni abrir: aparecían como un adjunto llamado "adjunto" que no
 *  llevaba a ningún lado. Casi todas vienen de Google Calendar, en zona
 *  America/Bogota, y son las reuniones que RRHH agenda con la gente.
 *
 *  Esto NO pretende ser una librería de iCalendar: lee lo que la tarjeta
 *  muestra y nada más. Lo que no entiende, lo deja en null y la tarjeta lo
 *  omite — nunca inventa.
 */

export interface PersonaDelEvento {
  nombre: string | null;
  email: string | null;
  /** ACCEPTED, DECLINED, TENTATIVE, NEEDS-ACTION… tal como viene. */
  respuesta: string | null;
}

export interface EventoDeCalendario {
  titulo: string | null;
  inicio: Date | null;
  fin: Date | null;
  /** Un evento de día completo no tiene hora: mostrarla sería inventarla. */
  todoElDia: boolean;
  lugar: string | null;
  descripcion: string | null;
  organiza: PersonaDelEvento | null;
  invitados: PersonaDelEvento[];
  /** REQUEST (invita), CANCEL (cancela), REPLY (responde). */
  metodo: string | null;
  cancelado: boolean;
  /** Link de Meet/Zoom, si lo trae. Es lo primero que busca quien la abre. */
  enlace: string | null;
  /** La regla de repetición en crudo; la tarjeta solo avisa que se repite. */
  repeticion: string | null;
}

interface Linea {
  nombre: string;
  params: Record<string, string>;
  valor: string;
}

/** iCalendar parte las líneas largas a los 75 octetos y continúa la siguiente
 *  con un espacio o tabulación. Sin des-plegar, un título largo o un link de
 *  Meet llegan cortados por la mitad. */
function desplegar(texto: string): string[] {
  const crudas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const salida: string[] = [];
  for (const linea of crudas) {
    if (/^[ \t]/.test(linea) && salida.length) {
      salida[salida.length - 1] += linea.slice(1);
    } else {
      salida.push(linea);
    }
  }
  return salida;
}

/** Los textos vienen con comas, puntos y comas y saltos escapados. */
function desescapar(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function leerLinea(linea: string): Linea | null {
  const corte = linea.indexOf(":");
  if (corte < 0) return null;
  const izquierda = linea.slice(0, corte);
  const valor = linea.slice(corte + 1);

  const trozos = izquierda.split(";");
  const nombre = trozos[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const t of trozos.slice(1)) {
    const i = t.indexOf("=");
    if (i > 0) {
      params[t.slice(0, i).toUpperCase()] = t.slice(i + 1).replace(/^"|"$/g, "");
    }
  }
  return { nombre, params, valor };
}

/** Cuánto se corre una zona respecto de UTC en ese instante. Se calcula con
 *  `Intl` en vez de tablas propias: el navegador ya trae la base de zonas. */
function desfaseDeZona(d: Date, zona: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const parte of dtf.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  const comoSiFueraUtc = Date.UTC(
    p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second,
  );
  return comoSiFueraUtc - d.getTime();
}

/** `20260909T120000` en America/Bogota es un instante distinto que en UTC.
 *
 *  ⚠️ Mostrar la hora equivocada en una invitación es peor que no mostrarla:
 *  alguien llega tarde a la reunión. Por eso la conversión se hace de verdad y
 *  no sumando -5 a mano, que se rompe con el horario de verano.
 */
function instanteEnZona(
  y: number, mes: number, d: number, h: number, min: number, s: number,
  zona: string,
): Date | null {
  const pared = Date.UTC(y, mes - 1, d, h, min, s);
  try {
    // Dos pasadas: la primera estima el desfase, la segunda lo corrige si el
    // evento cae justo en un cambio de horario.
    let inst = pared - desfaseDeZona(new Date(pared), zona);
    inst = pared - desfaseDeZona(new Date(inst), zona);
    return new Date(inst);
  } catch {
    return null; // zona que el navegador no conoce
  }
}

function leerFecha(l: Linea): { fecha: Date | null; todoElDia: boolean } {
  const v = l.valor.trim();

  // Día completo: 20260909, sin hora.
  if (l.params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return { fecha: null, todoElDia: true };
    return {
      fecha: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
      todoElDia: true,
    };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return { fecha: null, todoElDia: false };
  const [, y, mes, d, h, min, s, z] = m;
  const n = (x: string) => Number(x);

  // Con Z es UTC exacto.
  if (z) {
    return {
      fecha: new Date(Date.UTC(n(y), n(mes) - 1, n(d), n(h), n(min), n(s))),
      todoElDia: false,
    };
  }

  // Con TZID, la hora es "de pared" en esa zona.
  if (l.params.TZID) {
    const f = instanteEnZona(n(y), n(mes), n(d), n(h), n(min), n(s), l.params.TZID);
    if (f) return { fecha: f, todoElDia: false };
  }

  // Sin Z ni TZID es "flotante": vale la hora local de quien la mira.
  return {
    fecha: new Date(n(y), n(mes) - 1, n(d), n(h), n(min), n(s)),
    todoElDia: false,
  };
}

function leerPersona(l: Linea): PersonaDelEvento {
  return {
    nombre: l.params.CN ? desescapar(l.params.CN) : null,
    email: l.valor.replace(/^mailto:/i, "").trim() || null,
    respuesta: l.params.PARTSTAT ?? null,
  };
}

/** Busca un link de videollamada. Google lo pone en X-GOOGLE-CONFERENCE, pero
 *  muchos clientes solo lo dejan suelto en la descripción o el lugar. */
function buscarEnlace(campos: {
  conferencia: string | null;
  lugar: string | null;
  descripcion: string | null;
}): string | null {
  if (campos.conferencia) return campos.conferencia;
  const donde = `${campos.lugar ?? ""}\n${campos.descripcion ?? ""}`;
  const m = donde.match(
    /https?:\/\/[^\s<>"]*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|whereby\.com|meet\.jit\.si)[^\s<>"]*/i,
  );
  return m ? m[0] : null;
}

/** Lee la PRIMERA invitación del archivo. Un .ics puede traer varios eventos
 *  (una agenda exportada), pero una invitación de correo trae uno. */
export function leerInvitacion(texto: string): EventoDeCalendario | null {
  if (!texto || !/BEGIN:VCALENDAR/i.test(texto)) return null;

  const lineas = desplegar(texto);
  let metodo: string | null = null;
  let dentro = false;

  const ev: EventoDeCalendario = {
    titulo: null, inicio: null, fin: null, todoElDia: false,
    lugar: null, descripcion: null, organiza: null, invitados: [],
    metodo: null, cancelado: false, enlace: null, repeticion: null,
  };
  let conferencia: string | null = null;
  let estado: string | null = null;

  for (const cruda of lineas) {
    const l = leerLinea(cruda);
    if (!l) continue;

    if (l.nombre === "METHOD" && !dentro) metodo = l.valor.trim().toUpperCase();
    if (l.nombre === "BEGIN" && l.valor.trim().toUpperCase() === "VEVENT") {
      dentro = true;
      continue;
    }
    if (l.nombre === "END" && l.valor.trim().toUpperCase() === "VEVENT") break;
    if (!dentro) continue;

    switch (l.nombre) {
      case "SUMMARY": ev.titulo = desescapar(l.valor).trim() || null; break;
      case "LOCATION": ev.lugar = desescapar(l.valor).trim() || null; break;
      case "DESCRIPTION": ev.descripcion = desescapar(l.valor).trim() || null; break;
      case "RRULE": ev.repeticion = l.valor.trim() || null; break;
      case "STATUS": estado = l.valor.trim().toUpperCase(); break;
      case "X-GOOGLE-CONFERENCE": conferencia = l.valor.trim() || null; break;
      case "ORGANIZER": ev.organiza = leerPersona(l); break;
      case "ATTENDEE": ev.invitados.push(leerPersona(l)); break;
      case "DTSTART": {
        const r = leerFecha(l);
        ev.inicio = r.fecha;
        ev.todoElDia = r.todoElDia;
        break;
      }
      case "DTEND": {
        const r = leerFecha(l);
        ev.fin = r.fecha;
        break;
      }
    }
  }

  // Sin un VEVENT con algo adentro no hay tarjeta que mostrar.
  if (!ev.titulo && !ev.inicio) return null;

  ev.metodo = metodo;
  ev.cancelado = metodo === "CANCEL" || estado === "CANCELLED";
  ev.enlace = buscarEnlace({ conferencia, lugar: ev.lugar, descripcion: ev.descripcion });
  return ev;
}
