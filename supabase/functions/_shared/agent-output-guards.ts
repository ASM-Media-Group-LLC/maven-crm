// Guardas determinísticas de salida del bot + detectores compartidos.
// Doctrina de la casa: cuando una regla de prompt falla repetido, el chequeo va al
// borde de salida (mismo patrón que el enmascarado de teléfonos y el neutralizador
// de voseo). Tests: deno test supabase/functions/_shared/agent-output-guards.test.ts

// ── Ack falso (el "anotado" fantasma) ───────────────────────────────────────────
// Historia: 30/07 cuatro casos ("✓ Miguel registrado" con cero filas); 31/07 el
// "Anotado:" pelado que pasó los 5 patrones (#1032); 03/08 "ya lo tengo guardado";
// 04/08 "Gracias Carolina, la tengo" sobre un horario que nunca escribió.
//
// CALIBRADO el 05/08 contra 1.098 mensajes reales del bot (14 días): la versión
// anterior daba ~3 falsos positivos por día — "lo tengo presente/claro/abierto",
// "no lo tengo en mis tools", "pásame el handle y te lo dejo listo" (una OFERTA,
// no un ack) — y cada FP quema hasta 2 reintentos de LLM y empuja a una tercera
// redacción más floja.
export const PATRONES_ACK_FALSO: RegExp[] = [
  /(?:✓|✅)[^\n]{0,80}\b(?:registrad|anotad|agendad|marcad|gestionad|guardad|cargad)/i,
  // AUDITORÍA 10-12/08: "Dale María, tenlo por hecho — ya quedaron CARGADAS en Maven
  // como gestión por WhatsApp de hoy (melossomconsulting, honeyfans.agency…)".
  // melossomconsulting sigue en stage 'Nuevo' con last_contact_date NULL y sin tocar
  // desde el 01/08. Se escapaba por dos agujeros a la vez: "quedaron" no lo cubría
  // `\bqueda\b` (el boundary corta antes de "-ron"), y "cargad" no estaba entre los
  // verbos. Es el fraseo natural para una carga masiva, justo lo más caro de fingir.
  /\b(?:qued[óo]|quedan|queda|quedaron|quedaban)\b[^\n]{0,40}\b(?:registrad|anotad|agendad|marcad|gestionad|guardad|cargad)/i,
  // "tenlo/dalo por hecho" = hecho consumado sobre algo que el bot no tocó.
  /\b(?:tenl[oa]|dal[oa]|dalo)\s+por\s+hecho\b/i,
  /\b(?:lo|la|los|las)\s+tengo\s+guardad/i,
  // "la tengo" SOLO si la frase termina ahí ([.,:!] o fin de línea): se queda el caso
  // real ("Gracias Carolina, la tengo.") y se sueltan "lo tengo presente/claro/
  // abierto/en mis tools" y "lo tengo — <dato>", que son lectura o cortesía.
  // El lookbehind suelta "no lo tengo".
  /(?<!\bno\s)\b(?:lo|la|los|las)\s+tengo\s*(?:[.:!,]|$)/im,
  /\b(?:lo|la|los|las)\s+(?:registr|anot|agend|guard)(?:é|e|amos|ó)\b/i,
  /\bya\s+(?:lo|la|los|las)\s+(?:registr|anot|agend|guard)/i,
  /\bte\s+lo\s+(?:registr|anot|agend)/i,
  // "dejé anotado" / "ya dejo anotado" — hecho consumado. El presente condicional
  // ("respondan por acá y lo dejo anotado", "te lo dejo listo si me pasas el handle")
  // es una PROMESA, no un ack — de eso se encarga la regla de PROMESAS FUTURAS.
  /\b(?:dej[ée]|ya\s+dej[oé])\s+(?:anotad|registrad|agendad|guardad|marcad)/i,
  /^\s*(?:listo[,!.]?\s+)?(?:anotad|registrad|agendad|apuntad|marcad|gestionad|guardad)[oa]s?\b/im,
  /\btom[oé]\s+nota\b/i,
];
export const afirmaRegistro = (s: string): boolean => PATRONES_ACK_FALSO.some((re) => re.test(s));

// ── Corrección de ESTILO de pitch ───────────────────────────────────────────────
// 05/08: OCHO correcciones de estilo en un día (argentino ×3, "muy genérico" ×2,
// "muy ghetto", "demasiado perfecto — tiene que sonar one on one", "sé más amable")
// y solo 1 regla guardada: el equipo re-entrena al bot todos los días. Este detector
// reconoce cuando el humano corrige CÓMO escribir (no QUÉ dato), para exigirle al
// bot que persista la lección antes de reenviar el pitch corregido.
export const CORRECCION_ESTILO_RE =
  /\b(?:argentin\w*|voseo|ghetto|rob[óo]tic\w*|gen[ée]ric\w*|demasiado\s+perfect\w*|one\s+on\s+one|m[áa]s\s+amigable|m[áa]s\s+amable|muy\s+informativo|no\s+engancha|agresividad\s+de\s+venta|hablando\s+muy|sonando\s+(?:a\s|muy|como)|suena[sn]?\s+(?:muy|a\s|como\s|gen[ée]ric|argentin|rob[óo]t)|no\s+(?:digas|hables|escribas)|mejora(?:r|ndo)?\s+(?:el|los|la)\s+(?:mensaje|texto|habla)|escrit\w+\s+(?:demasiado|muy)\s+perfect)/i;
export const esCorreccionDeEstilo = (s: string): boolean => CORRECCION_ESTILO_RE.test(s);

// Un pitch entregado de verdad = bloque citado con sustancia (≥40 chars).
export const TIENE_PITCH_CITADO = (s: string): boolean => /["“«][^"”»]{40,}["”»]/.test(s);

// ── Voseo residual DENTRO del pitch citado ──────────────────────────────────────
// El neutralizador (whatsapp.ts) corrige lo mapeado en TODO el mensaje al enviarlo.
// Esta lista caza conjugaciones dentro de comillas — el texto que el closer copia y
// pega a una creadora — por si se cuela una forma que el mapa no cubre. El 05/08 se
// fugaron "Vos ganás" y "pa que vos" tres veces en pitches.
const VOSEO_PITCH_RE =
  /\b(?:vos|sos|ganás|seguís|tenés|podés|querés|sabés|hacés|decís|venís|cobrás|facturás|entrás|vendés|llevás|pensás|necesitás|trabajás|manejás|respondés|escribís|subís|quedás)\b/i;
export function detectarVoseoEnPitch(s: string): string | null {
  for (const m of s.matchAll(/["“«]([^"”»]{20,})["”»]/g)) {
    const v = m[1].match(VOSEO_PITCH_RE);
    if (v) return v[0];
  }
  return null;
}

// ── Causa de fallo de LECTURA del scan ──────────────────────────────────────────
// Pedido de Jhon 06/08: "que el bot recuerde si le dicen 'tal creadora que no se
// pudo leer es por <razón>'". En el e2e del mismo día el modelo agradeció el dato
// y NO llamó set_scan_note — la memoria quedaba a su criterio. Este detector
// reconoce cuando el disparador EXPLICA por qué una creadora no se lee (verbo de
// lectura/escaneo negado + conector causal cerca) para exigir la nota en el borde.
export const CAUSA_FALLO_SCAN_RE =
  /\bno\s+(?:se|la|lo|las|los)\s+(?:puede[n]?\s+|pudo\s+|pudieron\s+|pudimos\s+|est[áa][n]?\s+pudiendo\s+)?(?:leer|lee[n]?|escanear|escanea[n]?)\b[\s\S]{0,60}?\b(?:porque|es\s+que|ya\s+que|es\s+por|por)\b/i;
export const esCausaDeFalloScan = (s: string): boolean => CAUSA_FALLO_SCAN_RE.test(s);

// ── Disputa de REGISTRO de promo ────────────────────────────────────────────────
// 06-07/08: ante "¿por qué no registraste la promo de X?" el modelo respondió dos
// veces con tools legacy (reporte de cobertura) sin consultar get_promo_registro —
// que es donde vive la respuesta real (la promo suele ESTAR, atribuida al día de
// publicación hora Bogotá) y la evidencia (screenshot). Detector: negación + verbo
// de registro/aparición + "promo" cerca, en cualquier orden.
export const DISPUTA_REGISTRO_RES: RegExp[] = [
  /\bno\s+(?:has?\s+|hab[ií]as?\s+|me\s+|te\s+|le[s]?\s+|las?\s+|los?\s+|se\s+)*(?:registr\w+|aparec\w+|marc\w+|figur\w+|detect\w+)\b[\s\S]{0,50}\bpromos?\b/i,
  /\bpromos?\b[\s\S]{0,50}\bno\s+(?:has?\s+|hab[ií]as?\s+|me\s+|te\s+|le[s]?\s+|las?\s+|los?\s+|se\s+)*(?:registr\w+|aparec\w+|marc\w+|figur\w+|detect\w+|sali[oó])\b/i,
];
export const esDisputaDeRegistro = (s: string): boolean => DISPUTA_REGISTRO_RES.some((re) => re.test(s));

// ── Promesa de COMPORTAMIENTO sin persistir ─────────────────────────────────────
// 07/08: Álvaro dio ~8 correcciones entre Ventas y Managers y el bot respondió
// "Entendido", "Dos cosas que quedan aplicadas", "Ajusto:", "Cambio de estrategia"
// — y guardó CERO reglas (última regla del día: 10:52, antes del feedback). Al día
// siguiente no recuerda nada: contentillo puro.
// La guarda de ack falso no lo cazaba porque solo mira promesas de DATO
// ("anotado/registrado/guardado"), no de CONDUCTA. Verificado: las 5 frases
// reales de ese día pasaban limpias.
// Un "Entendido" pelado NO alcanza para disparar (es acuse normal): hace falta
// un compromiso de conducta futura.
// 10/08: se fugó "de aquí en adelante" — la variante que el mapa no tenía (estaba
// "de ahora en adelante"), y "te aviso siempre", que es la forma en que el bot le
// promete una cadencia a alguien sin dejar fila.
export const PROMESA_CONDUCTA_RE =
  /\b(?:qued[ao]n?\s+(?:aplicad|ajustad|como\s+(?:norma|regla))|de\s+(?:ahora|aqu[íi]|hoy)\s+en\s+(?:adelante|m[áa]s)|a\s+partir\s+de\s+(?:ahora|hoy)|voy\s+a\s+(?:llevar|empezar|dejar\s+de|cambiar|corregir|aplicar|exigir|pedir\s+siempre)|no\s+(?:lo\s+)?voy\s+a\s+(?:dejar\s+pasar|volver\s+a)|ya\s+no\s+voy\s+a|cambio\s+de\s+(?:estrategia|enfoque|criterio|foco)|lo\s+(?:ajusto|aplico|corrijo)\b|\bajusto\s*[:,]|lo\s+tomo\s+como\s+(?:norma|regla)|te\s+(?:aviso|avisar[ée]|paso|pasar[ée]|mando|mandar[ée])\s+siempre)/im;
export const esPromesaDeComportamiento = (s: string): boolean => PROMESA_CONDUCTA_RE.test(s);

// ── Repetición: el bot re-mandando lo mismo ─────────────────────────────────────
// 07/08 en Ventas: entre 15:11 y 15:13 mandó CUATRO mensajes casi idénticos
// ("Entendido Álvaro 👆 PADRÓN DE AGENCIAS — peguen acá…") sin aportar un dato
// nuevo. Álvaro tuvo que sacarle los números a la fuerza. La guarda
// anti-doble-proactivo no aplica: esos mensajes SÍ responden a un disparador.
// Jaccard sobre palabras significativas (≥4 letras) — barato y suficiente para
// detectar "es el mismo mensaje con otras palabras de relleno".
export function similitudTexto(a: string, b: string): number {
  const norm = (s: string) =>
    new Set(
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4),
    );
  const A = norm(a), B = norm(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

// ── Saltos de línea ESCAPADOS que llegan como texto ─────────────────────────────
// El 07/08 16:06 la respuesta sobre Cheryl le llegó a Grace como un muro de 608
// caracteres con los "\\n" a la vista: el modelo escapó los saltos en el body del
// tool call (desliz de escapado, único caso en 3 días — NO es regresión del
// pipeline). Cura determinística en el borde: un "\\n" o "\\t" LITERAL en un
// mensaje de WhatsApp nunca es contenido querido — se convierte al carácter real.
export function desescaparSaltosLiterales(s: string): string {
  if (!s || (!s.includes("\\n") && !s.includes("\\t"))) return s;
  return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

// ── "Fulano no produjo nada" sin haber mirado los reportes ──────────────────────
// 08/08: Álvaro pidió el volumen de producción de 30 días para decidir puestos y
// despidos. El bot contestó "Isabel — 0 registros en Maven" y "Brayan — 0 registros"
// mirando SOLO leads de Maven. En whatsapp_daily_reports, Isabel tenía 27 videos y
// Lizeth 16 videos + 73 fotos + 11 posts: videos/fotos/posts/cuentas no viven en
// ninguna otra tabla. Declarar cero producción desde una fuente que no la registra
// es el antipatrón de la casa (la muestra tomada por el universo), pero aplicado a
// una PERSONA y con su puesto en juego.
export const CERO_PRODUCCION_RE =
  /\b(?:0|cero)\s+(?:registros?|n[úu]meros?|videos?|fotos?|posts?|publicaciones|piezas?|entregables?|leads?|cuentas?|contactad[oa]s?)\b|\bsin\s+(?:output|producci[óo]n|registros?|entregables?|piezas?)\b|\bno\s+(?:produjo|produce|registr[óo]|entreg[óo]|aport[óo])\s+(?:nada\b|ning)/i;
export const afirmaCeroProduccion = (s: string): boolean => CERO_PRODUCCION_RE.test(s);

// ── Caracterizar a una persona sin ventana ni evidencia ─────────────────────────
// Mismo día, mismo hilo: "Reactivos: Brayan e Isabel", "Lizeth necesita que le
// digan qué hacer", "poca pieza propia" — juicios de disposición entregados con la
// misma seguridad que una medición, a un jefe que dijo textual para qué los quería
// ("PERSONA → NUEVO PUESTO → QUÉ LE QUITAMOS"). No se prohíbe opinar: se exige
// decir sobre cuántos días se opina, o marcarlo como impresión.
export const CARACTERIZA_PERSONA_RE =
  /\b(?:reactiv[oa]s?\b|apaga(?:ndo)?\s+fuegos?|cuello\s+de\s+botella|necesita\s+que\s+le\s+(?:digan|diga|indiquen|est[ée]n)|hay\s+que\s+estar(?:le)?\s+encima|no\s+(?:rinde|da\s+el\s+ancho|vale\s+la\s+pena)|ejecuta\s+lo\s+que\s+le\s+pid|poca\s+(?:pieza|iniciativa|autonom[íi]a)|sin\s+iniciativa|no\s+es\s+aut[óo]nom|hay\s+que\s+reemplazar)/i;
export const caracterizaPersona = (s: string): boolean => CARACTERIZA_PERSONA_RE.test(s);

// Respaldo aceptable: una ventana temporal explícita (fechas, "N días", "esta
// semana") o un marcador honesto de que es inferencia. Con cualquiera de los dos
// la caracterización pasa — el objetivo es que el lector sepa sobre qué se opina.
export const RESPALDO_TEMPORAL_RE =
  /\b\d{1,2}\s*[/-]\s*\d{1,2}\b|\b\d{1,2}\s+de\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i;
export const RESPALDO_VENTANA_RE =
  /\b(?:[úu]ltim[oa]s?\s+\d+|\d+\s+d[íi]as?|\d+\s+semanas?|esta\s+semana|este\s+mes|[úu]ltimo\s+mes|hoy|ayer|anteayer)\b/i;
export const RESPALDO_HEDGE_RE =
  /\b(?:estimad[oa]|impresi[óo]n|inferid[oa]|infiero|aproximad[oa]|no\s+(?:lo\s+)?tengo\s+medid|seg[úu]n\s+(?:lo\s+registrado|los\s+reportes|el\s+chat)|sin\s+dato\s+duro|a\s+ojo)\b/i;
export const tieneRespaldoDeJuicio = (s: string): boolean =>
  RESPALDO_TEMPORAL_RE.test(s) || RESPALDO_VENTANA_RE.test(s) || RESPALDO_HEDGE_RE.test(s);

// ── Retractación: el bot se disculpa en el chat y la fila queda escrita ──────────
// AUDITORÍA 10-12/08 — el patrón que más daño hizo, cuatro casos en dos frentes:
//   · valevalois: publicó "Buen cierre Miguel — activó Content Protector" a los 9
//     segundos de una captura SIN TEXTO. Miguel lo desmintió a los 62 segundos, el
//     bot dijo "mi error" — y la fila quedó stage='won'. Se republicó CUATRO veces
//     en el DM del dueño y entró en la nota del día de Miguel.
//   · Velvet for Women: escribió stage='lost' seis segundos ANTES de preguntar
//     "¿la bajamos de cartera?". Álvaro nunca contestó. Agencia B2B con llamada
//     agendada, enterrada como perdida.
//   · gabbiel_of/piclink: "lo saco del registro" y a las 19:00 la republicó ganada.
//   · andreasoto: "es otro lead" — ese otro lead no existe.
//
// El bot sabe pedir perdón y NO sabe deshacer: no hay camino de vuelta a la base.
// ⚠️ La retractación casi nunca ocurre en la misma corrida que la escritura (en
// valevalois pasaron 72 segundos y son dos corridas distintas), así que mirar las
// escrituras de ESTA corrida no alcanza — hay que preguntarle a la tabla.
// El detector puede ser generoso porque el gate caro es la consulta: si no hay
// filas recientes escritas por el bot, no bloquea nada.
// ── Nombre pegado a un LID que no es el suyo ────────────────────────────────────
// AUDITORÍA 10-12/08: el corte del 11/08 15:00 dijo "Brayan @192457652338690: sin
// evidencia en el chat esta franja" — ese LID es el del DUEÑO. Y tres veces se
// etiquetó a @114426585833505 (el PADRE de Álvaro, is_owner=false, que escribió 0
// mensajes en la ventana) para temas del hijo. #1167 arregló el link LID→profile;
// la resolución POR NOMBRE sigue cayendo en el homónimo.
// Devuelve los pares <Nombre, LID> del texto ya compuesto para que el borde los
// verifique contra whatsapp_members: es una lectura barata y caza las tres.
export function extraerParesNombreLid(s: string): Array<{ nombre: string; lid: string }> {
  const pares: Array<{ nombre: string; lid: string }> = [];
  // "Brayan @192457652338690" / "Brayan: @192..." / "Brayan — @192..."
  const re = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\b[\s:—,-]{1,3}@(\d{8,})\b/g;
  for (const m of s.matchAll(re)) pares.push({ nombre: m[1], lid: m[2] });
  return pares;
}

export const RETRACTACION_RE =
  /\b(?:mi\s+error|me\s+equivoqu[ée]|fue\s+un\s+error|tien[eé]s\s+raz[óo]n|ten[ée]s\s+raz[óo]n|corregid[oa]\b|lo\s+corrijo|lo\s+saco\s+del\s+registro|lo\s+doy\s+de\s+baja|no\s+(?:era|es)\s+(?:una\s+)?venta|no\s+cuenta\s+como\s+venta|mal\s+(?:contad|atribuid|registrad|marcad)[oa]|me\s+adelant[ée]|retiro\s+lo\s+dicho|descarta\s+lo\s+que\s+dije)/i;
export const esRetractacion = (s: string): boolean => RETRACTACION_RE.test(s);
// ── Meta de números a quien tiene un fact que dice que no le corresponde ────────
// AUDITORÍA 10-12/08, y es el caso más instructivo de todos:
//   11/08 11:35 Lizeth avisa que no textea. El bot dice "anotado" y ESCRIBE la fila.
//   El fact quedó bien redactado y accionable: "NO hace outreach ni textea modelos,
//   por lo que no reporta números/contactados/respuestas". Activo, en el grupo
//   correcto, y loadPersonFacts LO CARGA en el prompt.
//   22 horas después, 12/08 10:01 — por el camino `mention`, el que SÍ carga facts:
//   "Buen día Lizeth 💪 arrancas activa. Meta hoy son 3 números también".
//
// O sea: escrito ✓, cargado ✓, en contexto ✓ — y el modelo lo ignoró igual. Es
// exactamente la doctrina de la casa: un hecho en el prompt es una sugerencia; lo
// que tiene que cumplirse va como chequeo determinístico en el borde. El fix #1166
// funcionó y el problema se movió un casillero: de la escritura a la LECTURA.
export const META_NUMEROS_RE =
  /\bmetas?\b[^\n]{0,40}?\d+\s*n[úu]meros?|\b\d+\s*n[úu]meros?\b[^\n]{0,25}?\b(?:hoy|c\/u|cada\s+uno|por\s+cabeza|diarios?)\b/i;
export const asignaMetaDeNumeros = (s: string): boolean => META_NUMEROS_RE.test(s);

// Un fact que EXIME de outreach. Deliberadamente estrecho: solo negaciones
// explícitas, no cualquier descripción de tareas.
export const FACT_SIN_OUTREACH_RE =
  /\bno\s+(?:hace|realiza|va\s+a\s+hacer)\s+outreach\b|\bno\s+textea\b|\bno\s+reporta\s+n[úu]meros\b|\bno\s+le\s+corresponden?\s+n[úu]meros\b|\bsin\s+meta\s+de\s+n[úu]meros\b/i;
export const factEximeDeNumeros = (s: string): boolean => FACT_SIN_OUTREACH_RE.test(s);

/**
 * Personas a las que el mensaje les está poniendo meta de números teniendo un fact
 * activo que las exime. Compara por PRIMER NOMBRE, que es como el bot las nombra en
 * el chat. Devuelve [] si el mensaje no asigna meta.
 */
export function metaContraFact(
  cuerpo: string,
  facts: Array<{ name: string; fact: string }>,
): Array<{ persona: string; fact: string }> {
  if (!asignaMetaDeNumeros(cuerpo)) return [];
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const texto = norm(cuerpo);
  const out: Array<{ persona: string; fact: string }> = [];
  for (const f of facts) {
    if (!factEximeDeNumeros(f.fact)) continue;
    const primer = norm(f.name).split(/\s+/)[0];
    if (primer.length >= 3 && new RegExp(`\\b${primer}\\b`).test(texto)) {
      out.push({ persona: f.name, fact: f.fact });
    }
  }
  return out;
}
