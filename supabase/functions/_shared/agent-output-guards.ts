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

// ── Ack de una DIRECTIVA del dueño (feedback que se evapora) ─────────────────────
// 21/08: Álvaro da políticas/procesos ("el proceso de CP es escaneo gratis + PDF…",
// "no vendan de entrada, regalen") y el bot a veces responde con un ack pelado
// ("Entendido Álvaro", "✓ Escuchado", "captado") SIN llamar add_persistent_rule →
// mañana arranca en blanco. PROMESA_CONDUCTA_RE no lo caza (esos verbos de cambio
// no aparecen en un "entendido" pelado) y afirmaRegistro tampoco (no dice "anotado").
// Este detector reconoce que el bot ARRANCA su reply CONFIRMANDO una orden. Es
// start-anchored y solo con acks fuertes: una respuesta de DATO arranca con el dato o
// el nombre, no con "entendido/captado/recibido". Se usa junto a isOwner (si el DUEÑO
// dio la instrucción) + !add_persistent_rule para exigir persistir antes de confirmar.
// Salta @menciones y un "Nombre, " inicial ("Álvaro, captado…").
export const ACK_DIRECTIVA_RE =
  /^\s*(?:@[\w.]+\s+)*(?:[A-ZÁÉÍÓÚ][\wáéíóúñ]+,\s+)?(?:✓|✅|👍|🙌)?\s*(?:entendid[oa]|escuchad[oa]|captad[oa]|capt[ée]|recibid[oa]|copiad[oa]|perfecto|listo|hecho|de\s+acuerdo|as[íi]\s+(?:lo\s+)?(?:hacemos|hago)|claro\s+que\s+s[íi])\b/iu;
export const esAckDeDirectiva = (s: string): boolean => ACK_DIRECTIVA_RE.test(s);

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
    // TAMBIÉN el apodo de WhatsApp. 13/08: el fact de Lizeth estaba activo y la
    // guarda desplegada — y el bot le puso meta de números DOS VECES en la mañana
    // (09:01 "Daniel y Liss arrancan outreach — meta 3 números" y 09:49 "meta de
    // hoy son 3 números c/u (Daniel, Casta, Liss)"). La guarda comparaba solo el
    // primer nombre de Maven ("lizeth") y el bot la nombra como en el chat:
    // "Liss". loadPersonFacts ya embebe el apodo en el nombre — se aprovecha.
    const candidatos = new Set<string>();
    const primer = norm(f.name).split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    if (primer.length >= 3) candidatos.add(primer);
    const apodo = f.name.match(/aparece como\s+"([^"]+)"/i)?.[1];
    if (apodo) {
      const a = norm(apodo).split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
      if (a.length >= 3) candidatos.add(a);
    }
    if ([...candidatos].some((n) => new RegExp(`\\b${n}\\b`).test(texto))) {
      out.push({ persona: f.name, fact: f.fact });
    }
  }
  return out;
}

// ── Negación FALSA de leer adjuntos ─────────────────────────────────────────────
// El bot SÍ recibe imágenes y documentos: whatsapp-analyze-image / -extract-document
// corren Vision+OCR y le entregan el contenido en el contexto como "[imagen] <texto>"
// / "[documento] <texto>", igual que un audio transcrito. Aun así, a veces NIEGA la
// capacidad — el 18/08 a Carolina, dos veces: "no puedo ver imágenes/PDF que suban al
// grupo, así que capturas tampoco las puedo analizar" y "Lo del PDF no lo puedo recibir
// por acá". El MOTOR ya lo prohíbe (#1205) pero es prosa; esto lo caza en el borde.
// CLAVE de diseño: distingue "no PUEDO" (capacidad, presente → FALSO, se caza) de
// "no PUDE leer este archivo" (un intento puntual que falló, pasado → legítimo, NO se
// caza) — por eso la lista de verbos es puedo/puedes/logro/consigo/sé, nunca pude/pudo.
// Además se exime el marcador de sistema "NO SE PUDO LEER" (formato no soportado real).
export const NIEGA_ADJUNTOS_VERBO_NOMBRE =
  /\bno\s+(?:lo\s+|la\s+|las\s+|los\s+|te\s+|me\s+)?(?:puedo|puedes|logro|consigo|s[eé])\s+(?:\w+\s+){0,2}?(?:ver|leer|abrir|recibir|procesar|analizar|interpretar)\b[^.\n]{0,20}?(?:im[aá]genes?|fotos?|capturas?|pantallazos?|pdf|documentos?|archivos?|adjuntos?)/iu;
export const NIEGA_ADJUNTOS_NOMBRE_VERBO =
  /(?:im[aá]genes?|fotos?|capturas?|pantallazos?|pdf|documentos?|archivos?|adjuntos?)\b[^.\n]{0,25}?\b(?:no|tampoco)\b[^.\n]{0,18}?\b(?:puedo|puedes|logro|consigo)\b[^.\n]{0,14}?(?:ver|leer|abrir|recibir|analizar|procesar|interpretar)/iu;
export function niegaLeerAdjuntos(s: string): boolean {
  if (/no\s+se\s+pud[oe]\s+leer/iu.test(s)) return false; // marcador legítimo de formato no soportado
  return NIEGA_ADJUNTOS_VERBO_NOMBRE.test(s) || NIEGA_ADJUNTOS_NOMBRE_VERBO.test(s);
}

// ── Ack falso, 3ª insistencia: se publica pero con la duda ADELANTE ─────────────
// La guarda de "anotado fantasma" devuelve el control 2 veces; a la 3ª el mensaje
// sale igual (nunca mudo). El 15/08 12:23 salió así "Anotado en Maven: tipsyagency
// como oportunidad BLU interesada" — ESA corrida no escribió nada (agent_false_ack,
// 2 bloqueos). El aviso habla SOLO de lo que esta corrida sabe de sí misma: en el
// caso tipsy una corrida vecina del mismo minuto SÍ había insertado la fila, así
// que afirmar "NO quedó registrado" sería mentir al revés. Verificable ≠ adivinable:
// el lector queda avisado de que el registro no tiene respaldo en ESTE turno.
// El aviso va UNA sola vez y con ESTA redacción. El 18/08 17:00 el corte de
// Managers salió con la advertencia DUPLICADA (una en mayúscula "NINGUNA" de acá
// y otra abajo, en minúscula, que el modelo escribió solo): venía imitando su
// propia salida sanitizada de cortes anteriores — el mismo patrón de #1138, donde
// el modelo copiaba el estilo de sus instrucciones. Fabiana y Carolina abrieron su
// corte con dos avisos seguidos de "no confíen en esto". Por eso primero se BORRA
// cualquier variante que traiga el cuerpo y recién después se antepone la canónica:
// así el texto no depende de que el modelo se acuerde de no escribirla.
const AVISO_SIN_PERSISTENCIA =
  "⚠️ Ojo: en esta corrida no ejecuté NINGUNA escritura en Maven — si abajo digo que " +
  "algo quedó registrado/anotado, verifíquenlo antes de confiar.";

// Cubre la redacción propia y las que improvisa el modelo ("no ejecuté ninguna
// escritura", "no hice ninguna escritura", "no ejecuté escrituras"). Se come el
// párrafo entero (hasta el doble salto) porque el aviso siempre viene suelto.
const RE_AVISO_SIN_PERSISTENCIA =
  /^[^\n]*?no\s+(?:ejecut[ée]|hice|realic[ée])\s+(?:ningun[ao]s?\s+)?escrituras?\s+en\s+maven[^\n]*(?:\n{1,2}|$)/gimu;

export function marcarAckSinPersistencia(cuerpo: string): string {
  const limpio = cuerpo.replace(RE_AVISO_SIN_PERSISTENCIA, "").trimStart();
  return `${AVISO_SIN_PERSISTENCIA}\n\n${limpio}`;
}

// ── Muro de texto: mensaje largo Y SIN estructura de líneas ────────────────────────
// Pedido de Álvaro (08/2026): los mensajes programados de los 4 bots salen "demasiado
// largos / demasiado texto". El estilo aprobado para lo INTERNO al equipo es líneas
// cortas (1–4), listas 1·2·3 con una cosa por línea, menos comas — si parece un
// documento, está mal. La regla ya vive en el MOTOR como prosa, y la doctrina de la
// casa la aprendió varias veces: lo que importa se chequea en el BORDE de salida, no
// en el prompt (el modelo obedece "sé conciso" un rato y a las horas vuelve al muro).
//
// CONSERVADORA a propósito: castiga "largo Y SIN ESTRUCTURA", nunca "largo" a secas.
// Una lista de 12 personas una-por-línea o un corte de 6 líneas SON largos y están
// BIEN — tienen estructura, no disparan. Acortar = quitar ENVOLTORIO, jamás datos ni
// personas, así que el mensaje que devuelve el control pide re-partir en líneas, no
// recortar contenido.
//
// EXENCIÓN dura: si el mensaje trae un pitch/opener citado (bloque entre comillas de
// >=40 chars, vía TIENE_PITCH_CITADO), NO dispara. Los pitches a creadoras/agencias
// son la única prosa larga que se preserva pulida — nunca se parten en bullets.
//
// Disparador único (para no penalizar listas legítimas): PÁRRAFO LARGO — el trozo
// más largo entre saltos de línea supera ~250 chars (un bloque corrido de 3+ renglones
// sin respirar). Bajado de 350→250 el 21/08: el bot escribía bloques de 290-345 (uno
// por persona/tema) que quedaban justo bajo el viejo umbral; párrafos que Álvaro quiere
// partidos en líneas. Una lista de 12 personas una-por-línea o un corte de 6 líneas
// siguen pasando (cada línea corta). El viejo 2º disparador (total en <=3 líneas) quedó
// subsumido por este y se retiró.
export const MURO_PARRAFO_MAX = 250;

export function detectarMuroDeTexto(
  s: string,
  opts: { parrafoMax?: number } = {},
): { motivo: "parrafo_largo"; chars: number } | null {
  const parrafoMax = opts.parrafoMax ?? MURO_PARRAFO_MAX;
  const texto = (s ?? "").trim();
  if (!texto) return null;
  // Un pitch/opener citado es prosa larga LEGÍTIMA — no se parte nunca.
  if (TIENE_PITCH_CITADO(texto)) return null;
  // Trozos separados por saltos de línea REALES. Un "\\n" escapado llega como texto
  // visible (no es estructura): de eso se encarga desescaparSaltosLiterales, así que
  // acá un muro con "\\n" a la vista queda como un solo trozo, y bien.
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const trozoMasLargo = lineas.reduce((max, l) => Math.max(max, l.length), 0);
  // Un párrafo corrido largo (3+ renglones sin cortar) = muro. Se devuelve el control
  // para que el modelo lo parta en líneas; los datos se preservan por construcción.
  if (trozoMasLargo > parrafoMax) return { motivo: "parrafo_largo", chars: trozoMasLargo };
  return null;
}
export const esMuroDeTexto = (s: string): boolean => detectarMuroDeTexto(s) !== null;

// Mensaje vacío: en blanco, solo espacios, o solo caracteres invisibles (zero-width,
// NBSP, word-joiner). El 21/08 el bot le respondió a Fabiana con un solo zero-width
// space. Publicar un mensaje vacío nunca es correcto → se bloquea en el borde de salida.
export function esMensajeVacio(s: string): boolean {
  return (s ?? "").replace(/[\s\u200B\u200C\u200D\u2060\uFEFF]/g, "").length === 0;
}
