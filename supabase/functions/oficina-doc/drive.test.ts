// Correr: deno test --no-check supabase/functions/oficina-doc/drive.test.ts supabase/functions/oficina-doc/jwt.test.ts
import {
  adivinarDelimitador, claveDeDrive, claveDeEdicion, codigoDePagina, comoSeAbre, configDeEdicion, configDeVista,
  errorDeConversion, esDelServidor, esUuid, filasDeVersion, formatoDeOffice, FORMATOS_OFFICE, nombreSinExtension,
  pedidoDeConversion, POR_MIME, queHacerConElAviso, restauradaEl, SE_EDITAN_EN_SU_LUGAR, TAMANO_PARTE_NAS, textoDeMuestra,
  TOPE_COPIA, TOPE_VISTA,
} from "./drive.ts";
import { TAMANO_PARTE } from "../drive/logica.ts";

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
const igual = (a: unknown, b: unknown, m: string) =>
  assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const archivo = {
  id: "0b9c2f6e-1111-4c4c-9a9a-123456789abc",
  nombre: "Balance 2026.xlsx",
  sha256: "a".repeat(64),
  updated_at: "2026-10-01T12:00:00Z",
};

Deno.test("el formato sale de la extensión y manda sobre el tipo de la ficha", () => {
  igual(formatoDeOffice("Contrato.DOCX", null), { ext: "docx", editor: "word", destino: "docx" }, "docx en mayúsculas");
  igual(formatoDeOffice("viejo.doc", "application/octet-stream"), { ext: "doc", editor: "word", destino: "docx" }, "doc");
  igual(formatoDeOffice("lista.csv", "text/plain"), { ext: "csv", editor: "cell", destino: "xlsx" }, "csv");
  igual(formatoDeOffice("charla.odp", null), { ext: "odp", editor: "slide", destino: "pptx" }, "odp");
  // La extensión gana aunque la ficha diga otra cosa.
  igual(formatoDeOffice("informe.pptx", "application/pdf"), { ext: "pptx", editor: "slide", destino: "pptx" }, "pptx con mime de pdf");
});

Deno.test("sin extensión conocida, cuenta el tipo de la ficha", () => {
  igual(formatoDeOffice("Contrato", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    { ext: "docx", editor: "word", destino: "docx" }, "docx por mime");
  igual(formatoDeOffice("datos.bin", "text/csv; charset=utf-8"), { ext: "csv", editor: "cell", destino: "xlsx" }, "csv con charset");
});

Deno.test("lo que no es de Office no se abre con la Oficina", () => {
  for (const [n, m] of [["foto.jpg", "image/jpeg"], ["cv.pdf", "application/pdf"], ["notas", "text/plain"], ["x", null], ["pagina.html", "text/html"]] as const) {
    assert(formatoDeOffice(n, m) === null, `abrió ${n}`);
  }
});

Deno.test("cada formato del mime existe en la tabla, y la copia siempre es docx, xlsx o pptx", () => {
  for (const ext of Object.values(POR_MIME)) assert(!!FORMATOS_OFFICE[ext], `${ext} no está en la tabla`);
  for (const [ext, f] of Object.entries(FORMATOS_OFFICE)) {
    assert(["docx", "xlsx", "pptx"].includes(f.destino), `${ext} → ${f.destino}: la base no lo acepta`);
    const esperado = { word: "docx", cell: "xlsx", slide: "pptx" }[f.editor];
    assert(f.destino === esperado, `${ext}: editor ${f.editor} con destino ${f.destino}`);
  }
});

Deno.test("⚠️ la llave de ONLYOFFICE es estable, válida y cambia si cambia el archivo", () => {
  const k = claveDeDrive(archivo);
  assert(k === claveDeDrive({ ...archivo }), "estable");
  assert(/^[0-9A-Za-z._=-]{1,128}$/.test(k), `caracteres o largo inválidos: ${k}`);
  assert(k.includes(archivo.id), "lleva el id");
  assert(claveDeDrive({ ...archivo, sha256: "b".repeat(64) }) !== k, "otra huella, otra llave");
  // Lo importado de Google no tiene huella: manda la fecha.
  const sinHuella = { ...archivo, sha256: null };
  assert(claveDeDrive(sinHuella) === claveDeDrive({ ...sinHuella }), "estable sin huella");
  assert(claveDeDrive(sinHuella) !== claveDeDrive({ ...sinHuella, updated_at: "2026-10-02T12:00:00Z" }), "otra fecha, otra llave");
  assert(/^[0-9A-Za-z._=-]+$/.test(claveDeDrive({ ...sinHuella, updated_at: "basura" })), "fecha ilegible no rompe la llave");
});

Deno.test("⚠️ una versión RESTAURADA no reusa la llave que ONLYOFFICE ya usó con esa huella", () => {
  // «Administrar versiones» › Restaurar vuelve a poner un archivo viejo, con su
  // misma huella: con la llave de entonces ONLYOFFICE abriría lo de aquella
  // sesión (o diría que «la versión cambió»).
  const k = claveDeDrive(archivo);
  const r1 = claveDeDrive({ ...archivo, restaurada_at: "2026-10-03T10:00:00Z" });
  const r2 = claveDeDrive({ ...archivo, restaurada_at: "2026-10-03T11:00:00Z" });
  assert(r1 !== k && r2 !== r1, "restaurada: otra llave, y otra cada vez que se restaura");
  assert(/^[0-9A-Za-z._=-]{1,128}$/.test(r1), `caracteres o largo inválidos: ${r1}`);
  assert(claveDeDrive({ ...archivo, restaurada_at: null }) === k, "lo que nunca se restauró conserva la llave de siempre");
  assert(claveDeEdicion({ ...archivo, restaurada_at: "2026-10-03T10:00:00Z" }) !== claveDeEdicion(archivo), "la de edición también cambia");
  assert(claveDeDrive({ ...archivo, restaurada_at: "basura" }) === k, "una fecha ilegible no rompe la llave");
  // Un archivo del NAS aparece una vez por guardado: dos o más = se restauró.
  igual(restauradaEl([]), null, "sin versiones");
  igual(restauradaEl([{ created_at: "2026-10-01T00:00:00Z" }]), null, "una sola vez: no se restauró");
  igual(restauradaEl([{ created_at: "2026-10-03T10:00:00Z" }, { created_at: "2026-10-01T00:00:00Z" }]), "2026-10-03T10:00:00Z",
    "dos veces: la más nueva es la restauración");
});

Deno.test("⚠️ la vista es SOLO LECTURA: sin edición y sin a dónde avisar un guardado", () => {
  const formato = formatoDeOffice(archivo.nombre, null)!;
  const c = configDeVista({
    archivo, formato, url: "https://nas/o?t=x", usuario: { id: "u1", nombre: "Keila" }, idioma: "en", tema: "dark",
  }) as {
    documentType: string;
    document: { key: string; title: string; fileType: string; url: string; permissions: { edit: boolean } };
    editorConfig: { mode: string; lang: string; callbackUrl?: string; user: { id: string; name: string }; customization: Record<string, unknown> };
  };
  assert(c.documentType === "cell", "editor de hojas");
  assert(c.document.permissions.edit === false, "edit tiene que ser false");
  assert(c.editorConfig.mode === "view", "modo vista");
  assert(!("callbackUrl" in c.editorConfig), "no hay callbackUrl");
  assert(c.document.url === "https://nas/o?t=x" && c.document.fileType === "xlsx" && c.document.title === archivo.nombre, "documento");
  assert(c.document.key === claveDeDrive(archivo), "la llave");
  assert(c.editorConfig.lang === "en" && c.editorConfig.user.name === "Keila", "idioma y persona");
  assert(c.editorConfig.customization.uiTheme === "theme-night", "tema oscuro");
  assert(c.editorConfig.customization.chat === false, "sin chat");
  const sinTema = configDeVista({ archivo, formato, url: "u", usuario: { id: "u", nombre: "n" }, idioma: "es" }) as {
    editorConfig: { customization: Record<string, unknown> };
  };
  assert(!("uiTheme" in sinTema.editorConfig.customization), "sin tema no se manda uiTheme");
});

Deno.test("el separador de un CSV: punto y coma, coma o tabulador; las comillas no cuentan", () => {
  assert(adivinarDelimitador("nombre;ciudad;monto\nAna;Cali;3") === 2, "punto y coma");
  assert(adivinarDelimitador("nombre,ciudad,monto\n") === 4, "coma");
  assert(adivinarDelimitador("a\tb\tc") === 1, "tabulador");
  assert(adivinarDelimitador('"Bogotá, D.C.";"Cali, Valle";x\n') === 2, "las comas entre comillas no cuentan");
  assert(adivinarDelimitador("") === 4 && adivinarDelimitador("una sola columna") === 4, "sin pistas: coma");
});

Deno.test("el pedido de conversión: del formato viejo al de la Oficina, y el CSV con su separador", () => {
  const doc = { ...archivo, nombre: "Acta.doc" };
  const p = pedidoDeConversion({ archivo: doc, formato: formatoDeOffice(doc.nombre, null)!, url: "https://nas/o?t=1" });
  igual([p.async, p.filetype, p.outputtype, p.title, p.url], [false, "doc", "docx", "Acta.docx", "https://nas/o?t=1"], "doc → docx");
  assert(!("delimiter" in p), "un .doc no lleva separador");
  assert(/^[0-9A-Za-z._=-]{1,128}$/.test(String(p.key)), "llave válida");
  const csv = { ...archivo, nombre: "ventas.csv" };
  const c = pedidoDeConversion({ archivo: csv, formato: formatoDeOffice(csv.nombre, null)!, url: "u", delimitador: 2 });
  igual([c.outputtype, c.codePage, c.delimiter], ["xlsx", 65001, 2], "csv → xlsx en UTF-8 con punto y coma");
});

Deno.test("nombres, errores y topes", () => {
  assert(nombreSinExtension("Balance 2026.xlsx") === "Balance 2026", "saca la extensión");
  assert(nombreSinExtension(".xlsx") === ".xlsx", "no deja el título vacío");
  assert(nombreSinExtension("sin extension") === "sin extension", "sin extensión");
  assert(/contraseña/.test(errorDeConversion(-5)) && /-99/.test(errorDeConversion(-99)), "errores legibles");
  assert(TOPE_COPIA <= TOPE_VISTA && TOPE_VISTA <= 100 * 1024 * 1024, "topes");
});

Deno.test("⚠️ el resultado de la conversión solo se baja del mismo servidor de Oficina", () => {
  assert(esDelServidor("https://oficina.maven-ai.me/cache/files/x/output.docx", "https://oficina.maven-ai.me"), "mismo");
  assert(!esDelServidor("https://169.254.169.254/latest/meta-data", "https://oficina.maven-ai.me"), "otro host");
  assert(!esDelServidor("no es una url", "https://oficina.maven-ai.me"), "basura");
});

// ── Editar EL MISMO archivo (02/10: «que sea exactamente como Google») ──────

Deno.test("un .txt se abre en Documentos (convertido), como en Google", () => {
  igual(formatoDeOffice("notas.TXT", null), { ext: "txt", editor: "word", destino: "docx" }, "txt");
  assert(comoSeAbre({ ext: "txt" }) === "convertir", "un .txt se convierte, no se edita en su lugar");
});

Deno.test("qué se edita en su lugar y qué se convierte a una copia", () => {
  for (const ext of ["docx", "xlsx", "pptx", "xlsm", "docm", "pptm"]) assert(comoSeAbre({ ext }) === "editar", `${ext} en su lugar`);
  for (const ext of ["doc", "xls", "ppt", "odt", "ods", "odp", "rtf", "csv", "txt"]) assert(comoSeAbre({ ext }) === "convertir", `${ext} se convierte`);
  // Todo lo que se edita en su lugar tiene que poder abrirse con la Oficina.
  for (const ext of SE_EDITAN_EN_SU_LUGAR) assert(!!FORMATOS_OFFICE[ext], `${ext} no está en FORMATOS_OFFICE`);
});

Deno.test("⚠️ la llave de edición: otra que la de la vista, y cambia con lo guardado", () => {
  const k = claveDeEdicion(archivo);
  assert(k !== claveDeDrive(archivo), "la vista y la edición no comparten sesión");
  assert(k === claveDeEdicion({ ...archivo }), "estable: quienes abren antes de guardar caen en la misma sesión");
  assert(claveDeEdicion({ ...archivo, sha256: "c".repeat(64) }) !== k, "guardado = sesión nueva");
  assert(/^[0-9A-Za-z._=-]{1,128}$/.test(k), `caracteres o largo inválidos: ${k}`);
});

Deno.test("la config de edición: modo edición, a dónde avisar, y sin guardado forzado", () => {
  const formato = formatoDeOffice(archivo.nombre, null)!;
  const c = configDeEdicion({
    archivo, formato, url: "https://nas/o?t=x", callbackUrl: "https://maven/functions/v1/oficina-doc?guardar_drive=p",
    usuario: { id: "u1", nombre: "María" }, idioma: "es", tema: "light", volverA: "https://app.maven-ai.me/oficina/drive",
  }) as {
    documentType: string;
    document: { key: string; fileType: string; url: string; permissions: { edit: boolean } };
    editorConfig: { mode: string; callbackUrl: string; customization: Record<string, unknown> };
  };
  assert(c.documentType === "cell" && c.document.fileType === "xlsx", "editor de hojas");
  assert(c.document.permissions.edit === true && c.editorConfig.mode === "edit", "se edita");
  assert(c.editorConfig.callbackUrl.endsWith("guardar_drive=p"), "avisa al guardar");
  assert(c.document.key === claveDeEdicion(archivo), "la llave de edición");
  assert(c.editorConfig.customization.forcesave === false, "⚠️ sin guardado forzado (partiría la sesión)");
  assert(c.editorConfig.customization.chat === false, "sin chat");
  assert(c.editorConfig.customization.uiTheme === "theme-white", "tema claro");
  assert((c.editorConfig.customization.goback as { url: string }).url.endsWith("/oficina/drive"), "volver al Drive");
});

Deno.test("qué hacer con cada aviso de ONLYOFFICE", () => {
  const srv = "https://oficina.maven-ai.me";
  const url = `${srv}/cache/files/x/output.xlsx`;
  igual(queHacerConElAviso({ status: 2, url, filetype: "xlsx" }, "xlsx", srv), { accion: "guardar", url }, "2 guarda");
  igual(queHacerConElAviso({ status: 2, url }, "xlsx", srv), { accion: "guardar", url }, "sin filetype también");
  assert(queHacerConElAviso({ status: 2, url: "https://169.254.169.254/x" }, "xlsx", srv).accion === "rechazar", "⚠️ de otro host no se baja");
  assert(queHacerConElAviso({ status: 2, url, filetype: "docx" }, "xlsx", srv).accion === "rechazar", "⚠️ otro formato no pisa el archivo");
  assert(queHacerConElAviso({ status: 2 }, "xlsx", srv).accion === "rechazar", "sin url");
  for (const status of [1, 4, 6]) assert(queHacerConElAviso({ status, url }, "xlsx", srv).accion === "nada", `status ${status}`);
  const error = queHacerConElAviso({ status: 3 }, "xlsx", srv);
  assert(error.accion === "nada" && /error/.test((error as { motivo: string }).motivo), "status 3 se anota como error");
});

Deno.test("el historial: la primera edición anota también el original; las demás, solo la nueva", () => {
  const anterior = { storage_key: "t/google/x", size: 10, sha256: null, updated_at: "2025-01-01T00:00:00Z", owner_id: null };
  const nueva = { storage_key: "t/nueva", size: 12, sha256: "d".repeat(64) };
  const primera = filasDeVersion({ itemId: "i", anterior, hayHistorial: false, nueva, quien: "u1", ahora: "2026-10-02T00:00:00Z" });
  igual(primera.map((f) => [f.storage_key, f.saved_by, f.created_at]),
    [["t/google/x", null, "2025-01-01T00:00:00Z"], ["t/nueva", "u1", "2026-10-02T00:00:00Z"]], "original + nueva");
  const otra = filasDeVersion({ itemId: "i", anterior, hayHistorial: true, nueva, quien: "u1", ahora: "x" });
  igual(otra.map((f) => f.storage_key), ["t/nueva"], "solo la nueva");
  assert(esUuid("0b9c2f6e-1111-4c4c-9a9a-123456789abc") && !esUuid("u1") && !esUuid(null), "uuid");
});

Deno.test("⚠️ las partes al guardar en el NAS son las mismas que las de una subida del Drive", () => {
  assert(TAMANO_PARTE_NAS === TAMANO_PARTE, "TAMANO_PARTE_NAS ≠ TAMANO_PARTE de la edge drive");
});

Deno.test("la codificación de un .txt o un .csv, para que las tildes no se rompan", () => {
  const b = (...x: number[]) => new Uint8Array(x);
  assert(codigoDePagina(b(0xef, 0xbb, 0xbf, 0x61)) === 65001, "UTF-8 con BOM");
  assert(codigoDePagina(b(0xff, 0xfe, 0x61, 0x00)) === 1200, "UTF-16 LE");
  assert(codigoDePagina(b(0xfe, 0xff, 0x00, 0x61)) === 1201, "UTF-16 BE");
  assert(codigoDePagina(new TextEncoder().encode("año, Bogotá")) === 65001, "UTF-8 sin BOM");
  assert(codigoDePagina(b(0x61, 0xf1, 0x6f)) === 1252, "«año» del Bloc de notas viejo (Windows-1252)");
  assert(codigoDePagina(new TextEncoder().encode("año").subarray(0, 2)) === 65001, "una letra cortada al final de la muestra no es error");
  assert(codigoDePagina(new TextEncoder().encode("hola")) === 65001 && codigoDePagina(b()) === 65001, "ASCII y vacío");
  assert(textoDeMuestra(b(0x61, 0xf1, 0x6f, 0x3b), 1252) === "año;", "la muestra se lee con su codificación");
  assert(textoDeMuestra(b(0xff, 0xfe, 0x3b, 0x00), 1200) === ";", "UTF-16");
});

Deno.test("el pedido de conversión de un .txt y de un .csv lleva su codificación", () => {
  const txt = { ...archivo, nombre: "notas.txt" };
  const t = pedidoDeConversion({ archivo: txt, formato: formatoDeOffice(txt.nombre, null)!, url: "u", codePage: 1252 });
  igual([t.filetype, t.outputtype, t.codePage, "delimiter" in t], ["txt", "docx", 1252, false], "txt → docx en Windows-1252");
  const csv = { ...archivo, nombre: "ventas.csv" };
  const c = pedidoDeConversion({ archivo: csv, formato: formatoDeOffice(csv.nombre, null)!, url: "u", delimitador: 2, codePage: 1252 });
  igual([c.codePage, c.delimiter], [1252, 2], "csv de Excel en Colombia");
  const sinCodigo = pedidoDeConversion({ archivo: txt, formato: formatoDeOffice(txt.nombre, null)!, url: "u" });
  assert(sinCodigo.codePage === 65001, "sin muestra: UTF-8");
});
