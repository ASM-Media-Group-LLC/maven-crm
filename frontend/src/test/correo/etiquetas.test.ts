import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lo reportó Keila: «el correo de Maven no tiene etiquetas??». El botón
// estaba dibujado y marcado "pronto": se veía, se tocaba y no hacía nada.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const mig = leer("supabase/migrations/20260918200000_correo_etiquetas.sql");
const hook = leer("frontend/src/hooks/useEtiquetasCorreo.ts");
const pagina = leer("frontend/src/pages/correo/CorreoPage.tsx");

describe("⚠️ la etiqueta se ata al message_id, NO al uid", () => {
  it("la tabla de asignaciones usa message_id", () => {
    // El uid CAMBIA al mover el correo de carpeta y la fila de la caché se
    // borra y se recrea: con el uid, la etiqueta se pierde la primera vez que
    // alguien archiva — o peor, la hereda otro mensaje que reciba ese uid.
    // Se mira SOLO el CREATE TABLE: los comentarios de alrededor explican
    // justamente por qué no se usa el uid, y nombrarlo ahí no es usarlo.
    const i = mig.indexOf("CREATE TABLE IF NOT EXISTS public.mail_message_labels");
    const j = mig.indexOf(");", i);
    expect(i, "no está la tabla").toBeGreaterThan(-1);
    const tabla = mig.slice(i, j);
    expect(tabla).toMatch(/message_id text NOT NULL/);
    expect(tabla, "la etiqueta NO puede colgar del uid").not.toMatch(/\buid\b/);
    expect(tabla).not.toMatch(/\bfolder\b/);
  });

  it("el hook etiqueta por messageId y avisa cuando falta", () => {
    expect(hook).toMatch(/messageIds/);
    expect(pagina).toMatch(/\.map\(\(m\) => m\.messageId\)\.filter\(Boolean\)/);
    expect(pagina).toMatch(/no tienen identificador/);
  });
});

describe("las etiquetas son de cada quien", () => {
  it("las dos tablas tienen RLS y se acotan a auth.uid()", () => {
    expect(mig).toMatch(/ALTER TABLE public\.mail_labels ENABLE ROW LEVEL SECURITY/);
    expect(mig).toMatch(/ALTER TABLE public\.mail_message_labels ENABLE ROW LEVEL SECURITY/);
    const politicas = mig.match(/USING \(user_id = auth\.uid\(\)\)/g) ?? [];
    expect(politicas.length, "faltan políticas por user_id").toBeGreaterThanOrEqual(2);
  });

  it("dos etiquetas con el mismo nombre no pueden convivir en un buzón", () => {
    expect(mig).toMatch(/UNIQUE \(user_id, nombre\)/);
  });
});

describe("el color, como en Gmail", () => {
  // #1893 usaba seis tokens del tema. Desde el 28/09 (Jhon: «igual que en
  // gmail») son dos hex —fondo y texto— de la lista cerrada de Gmail; la
  // guarda de eso vive en etiquetasComoGmail.test.ts.
  it("la migración vieja sigue con su CHECK de tokens (la columna queda para el frontend anterior)", () => {
    expect(mig).toMatch(/CHECK \(color IN \('primary','accent','success','warning','destructive','muted'\)\)/);
  });

  it("y el frontend ya no escribe la columna vieja", () => {
    expect(hook).not.toMatch(/insert\(\{[^}]*\bcolor\b/);
  });
});

describe("la UI", () => {
  it("ya no queda ningún «Etiquetar» gris", () => {
    expect(pagina).not.toMatch(/etiqueta="Etiquetar" pronto/);
  });

  it("la etiqueta se ve en el renglón de la conversación", () => {
    expect(pagina).toMatch(/etiquetas\?\.slice\(0, 3\)\.map\(\(e\) => \(\s*<PastillaEtiqueta/);
  });

  it("⚠️ se toman las de CUALQUIER mensaje del hilo", () => {
    // Se etiqueta una conversación, no un mensaje suelto adentro de ella: si
    // solo mirara el último, la etiqueta puesta sobre el primero no se vería.
    expect(pagina).toMatch(/for \(const m of h\.mensajes\)/);
  });
});
