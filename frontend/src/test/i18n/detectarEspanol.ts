// Detector de texto en español escrito a mano en el código.
//
// Lo usa el guard `sinEspanolNuevo.test.ts`. Vive aparte para que la regla sea
// UNA sola y se pueda leer sin el ruido del test.
//
// Qué busca: solo lo que un usuario ve en pantalla.
//   1. El contenido de una etiqueta JSX:            <p>Guardar cambios</p>
//   2. Atributos que se muestran o se leen en voz:  placeholder, title, alt,
//      aria-label, label, description, tooltip
//   3. Los avisos del sistema:                      toast.success("Guardado")
//      y las propiedades title/description/message que les pasan.
//
// Qué NO busca (a propósito, para no dar falsas alarmas):
//   - Nombres de módulos y submódulos de permisos (`module:`, `submodule:`):
//     son la LLAVE guardada en role_permissions, no texto. Traducirlos rompe
//     los permisos de todo el mundo.
//   - Clases de Tailwind, rutas, ids, claves de i18n y cualquier string que no
//     caiga en una de las tres formas de arriba.
//
// Cómo decide que algo es español: tiene acento/ñ/¿/¡, o contiene una palabra
// del idioma que no existe en inglés. La lista evita a propósito las que se
// escriben igual en los dos ("no", "final", "total"…) para no marcar texto
// inglés legítimo.

const ACENTOS = /[áéíóúÁÉÍÓÚñÑ¿¡]/;

const PALABRAS = new RegExp(
  "\\b(?:" +
    "de|del|la|el|los|las|un|una|unos|unas|para|con|sin|por|que|al|y|en|su|sus|se|" +
    "es|son|esta|estan|hay|mas|cada|todo|todos|toda|todas|este|esta|estos|estas|" +
    "nuevo|nueva|nuevos|nuevas|guardar|eliminar|cancelar|buscar|crear|editar|" +
    "agregar|anadir|enviar|volver|cerrar|abrir|cargando|seleccionar|fecha|nombre|" +
    "correo|usuario|usuarios|equipo|creadora|creadoras|ventas|reporte|reportes|" +
    "pendiente|pendientes|activo|activa|activos|activas|aceptar|siguiente|" +
    "anterior|ninguno|ninguna|desde|hasta|entre|sobre|tambien|solo|puede|debe|" +
    "tiene|hacer|ver|dia|dias|mes|meses|ano|anos|hora|horas|semana|semanas" +
  ")\\b",
  "i",
);

/** ¿Este texto suelto es español visible? */
export const esEspanol = (s: string): boolean => {
  const t = s.trim();
  if (t.length < 3) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (/^[A-Z_]+$/.test(t)) return false;           // CONSTANTES
  return ACENTOS.test(t) || PALABRAS.test(t);
};

const ATRIBUTOS = "placeholder|title|alt|aria-label|label|description|tooltip|emptyMessage";

const FORMAS: RegExp[] = [
  new RegExp(">([^<>{}\\n][^<>{}]*)<", "g"),                          // texto JSX
  new RegExp(`(?:${ATRIBUTOS})\\s*=\\s*"([^"]{3,})"`, "g"),           // attr="…"
  new RegExp(`(?:${ATRIBUTOS})\\s*=\\s*\\{\\s*["']([^"']{3,})["']\\s*\\}`, "g"), // attr={"…"}
  new RegExp(
    "(?:toast(?:\\.\\w+)?\\(|title:|description:|message:|label:)\\s*[\"']([^\"']{3,})[\"']",
    "g",
  ),
];

/** Todos los textos en español visibles de un archivo. */
export const buscarEspanol = (src: string): string[] => {
  const encontrados: string[] = [];
  for (const forma of FORMAS) {
    forma.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = forma.exec(src)) !== null) {
      if (esEspanol(m[1])) encontrados.push(m[1].trim());
    }
  }
  return encontrados;
};
