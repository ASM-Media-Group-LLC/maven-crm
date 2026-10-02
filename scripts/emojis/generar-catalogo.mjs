#!/usr/bin/env node
// Arma frontend/src/lib/emojis/catalogo.json: los emojis del selector (el de
// Google que pidió Keila) con su categoría y sus nombres en español e inglés
// para el buscador.
//
//   node scripts/emojis/generar-catalogo.mjs            # baja emojibase-data del CDN
//   node scripts/emojis/generar-catalogo.mjs <carpeta>  # o lo lee de un emojibase-data local
//
// Por qué un JSON generado y no la dependencia: emojibase-data pesa 50 MB en
// node_modules y sus dos archivos que sirven (es + en, compact.json) suman 1,1 MB
// porque traen los tonos de piel, los códigos y los atajos de cada plataforma.
// Este recorte queda en ~190 KB (~60 KB gzip), se baja SOLO al abrir el selector
// (import dinámico, chunk aparte) y el build no depende de nada nuevo.
//
// Qué se queda afuera:
//   - Los componentes (grupo 2: tonos de piel y pelo sueltos) y los indicadores
//     regionales sin grupo: no son emojis que alguien mande.
//   - Lo posterior a Emoji 15.0: la mayoría de los teléfonos y Windows todavía no
//     lo dibujan. Lo de 13 a 15 se filtra además en el navegador, según lo que
//     ESE equipo dibuje (ver lib/emojis/catalogo.ts).
//   - Los tonos de piel: el selector muestra el amarillo de siempre.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_EMOJIBASE = "17.0.0";
const VERSION_MAXIMA = 15;
const SALIDA = join(dirname(fileURLToPath(import.meta.url)), "../../frontend/src/lib/emojis/catalogo.json");

async function leer(locale) {
  const local = process.argv[2];
  if (local) return JSON.parse(await readFile(join(local, locale, "data.json"), "utf8"));
  const url = `https://cdn.jsdelivr.net/npm/emojibase-data@${VERSION_EMOJIBASE}/${locale}/data.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

// emojibase le pone U+FE0F a todo emoji de un solo carácter que TIENE versión de
// texto, aunque ya se dibuje como emoji por defecto: su 👍 es 1F44D FE0F. La
// forma oficial (emoji-test.txt, "fully-qualified") es 1F44D a secas, que es la
// que guardan las reacciones y las barras de hoy. Sin esto, el 👍 del selector y
// el de la barra serían DOS reacciones distintas en el mismo mensaje. Se comprobó
// contra emoji-test.txt 16.0: con esta regla, los 1.870 quedan como los oficiales.
function oficial(emoji) {
  const partes = [...emoji];
  if (partes.length === 2 && partes[1] === "️" && /^\p{Emoji_Presentation}$/u.test(partes[0])) {
    return partes[0];
  }
  return emoji;
}

// Etiquetas sin repetir y sin las que ya están dentro del nombre (el buscador
// busca en todo junto: "cara" sobra si el nombre es "cara sonriendo").
function etiquetas(nombre, ...listas) {
  const vistas = new Set();
  const salida = [];
  for (const t of listas.flat()) {
    const limpia = (t ?? "").trim().toLowerCase();
    if (!limpia || vistas.has(limpia) || nombre.toLowerCase().includes(limpia)) continue;
    vistas.add(limpia);
    salida.push(limpia);
  }
  return salida.join("|");
}

const [es, mx, en] = await Promise.all([leer("es"), leer("es-mx"), leer("en")]);
const deMexico = new Map(mx.map((e) => [e.hexcode, e]));
const enIngles = new Map(en.map((e) => [e.hexcode, e]));

const emojis = es
  .filter((e) => e.group !== undefined && e.group !== 2 && e.version <= VERSION_MAXIMA)
  .sort((a, b) => a.order - b.order)
  .map((e) => {
    const m = deMexico.get(e.hexcode) ?? e;
    const n = enIngles.get(e.hexcode);
    if (!n) throw new Error(`sin nombre en inglés: ${e.hexcode}`);
    // El nombre que se ve es el de es-MX (computadora, lentes, enojo: el de
    // Latinoamérica); el de España queda como etiqueta para que también se encuentre.
    const nombreEs = m.label;
    return [
      oficial(e.emoji),
      e.group,
      e.version,
      nombreEs,
      etiquetas(nombreEs, e.label, m.tags ?? [], e.tags ?? []),
      n.label,
      etiquetas(n.label, n.tags ?? []),
    ];
  });

const catalogo = {
  fuente: `emojibase-data ${VERSION_EMOJIBASE} (MIT). Nombres y etiquetas: Unicode CLDR (Unicode License v3).`,
  generadoPor: "scripts/emojis/generar-catalogo.mjs",
  campos: ["emoji", "grupo", "version", "nombreEs", "etiquetasEs", "nombreEn", "etiquetasEn"],
  emojis,
};

await writeFile(SALIDA, JSON.stringify(catalogo) + "\n");
console.log(`${emojis.length} emojis → ${SALIDA}`);
