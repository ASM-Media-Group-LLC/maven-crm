#!/usr/bin/env node
// TRADUCTOR DE MAVEN — llena alemán, francés, italiano y portugués con IA.
//
//   node scripts/i18n/traducir.mjs              # todo lo que falte, 4 idiomas
//   node scripts/i18n/traducir.mjs --idiomas de,fr
//   node scripts/i18n/traducir.mjs --solo portada.   # solo claves con ese prefijo
//   node scripts/i18n/traducir.mjs --seco        # solo cuenta lo que falta
//
// Fuente: el diccionario en español + inglés (lib/diccionario.ts). Destino:
// frontend/src/locales/<idioma>.json, con { t, en } por clave: `en` es el inglés
// del que salió la traducción; si después alguien cambia ese inglés, la clave
// vuelve a quedar pendiente y la app muestra inglés hasta que se retraduzca.
//
// La llave: GEMINI_API_KEY (variable de entorno; en CI, el secreto del repo) o,
// en la compu de quien desarrolla, ~/.config/maven/gemini.env. Nunca en el repo.
//
// Se puede cortar y volver a correr: guarda después de cada tanda.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cargarDiccionario, leerTraducciones, escribirTraducciones } from "./cargarDiccionario.mjs";

const IDIOMAS = { de: "German", fr: "French", it: "Italian", pt: "Brazilian Portuguese" };
// Cómo se le habla a la persona en cada idioma (el español de Maven usa «tú»).
const TRATO = {
  de: 'informal "du" (like modern SaaS apps), capitalise "Du" only at sentence start',
  fr: 'formal "vous"',
  it: 'informal "tu"',
  pt: 'Brazilian "você"',
};
// Nombres propios del producto: no se traducen.
const NO_TRADUCIR = ["Maven", "Cowork", "Argos", "Messenger", "Meet", "Drive", "Promolog", "Scouter", "Hubstaff", "WhatsApp", "Telegram", "Instagram", "OnlyFans", "Supervisor Hub", "Backstage"];

const TANDA = 80;          // claves por pedido
const EN_PARALELO = 4;     // pedidos a la vez por idioma
const MODELO = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function args() {
  const a = process.argv.slice(2);
  const valor = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  return {
    idiomas: (valor("--idiomas") ?? Object.keys(IDIOMAS).join(",")).split(",").filter((l) => IDIOMAS[l]),
    solo: valor("--solo"),
    seco: a.includes("--seco"),
  };
}

function llave() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const archivo = path.join(os.homedir(), ".config/maven/gemini.env");
  if (fs.existsSync(archivo)) {
    const m = fs.readFileSync(archivo, "utf8").match(/^GEMINI_API_KEY=(.+)$/m);
    if (m && m[1].trim() && !m[1].includes("PEGA_AQUI")) return m[1].trim();
  }
  return null;
}

const marcadores = (s) => [...String(s).matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]).sort().join("|");

function instrucciones(lang) {
  return [
    `You translate the user interface of "Maven", a business SaaS (virtual office, team chat, email, documents, HR, sales CRM), into ${IDIOMAS[lang]}.`,
    `Address the user with ${TRATO[lang]}.`,
    "Input: a JSON object { key: { en: English text, es: Spanish text } }. The English is the source; the Spanish is context for meaning and tone.",
    "Output: ONLY a JSON object { key: translation } with exactly the same keys.",
    "Rules:",
    "- Keep every placeholder in curly braces EXACTLY as is ({n}, {name}, …). Never translate or drop them.",
    "- Keep emojis, punctuation style, line breaks, HTML tags, markdown and leading/trailing symbols.",
    `- Never translate these product names: ${NO_TRADUCIR.join(", ")}.`,
    "- Short, natural UI wording — like a native product designer would write it. Button labels stay short.",
    "- Keep the same casing style as the English (Title Case vs sentence case).",
  ].join("\n");
}

async function pedir(clave, lang, lote) {
  const cuerpo = {
    systemInstruction: { parts: [{ text: instrucciones(lang) }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(lote) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
  };
  for (let intento = 0; intento < 5; intento++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify(cuerpo),
    });
    if (r.status === 429 || r.status >= 500) {
      await new Promise((res) => setTimeout(res, 2000 * 2 ** intento));
      continue;
    }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const texto = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    try {
      return JSON.parse(texto);
    } catch {
      if (intento === 4) throw new Error("Gemini no devolvió JSON válido");
    }
  }
  throw new Error("Gemini no respondió después de varios intentos");
}

async function main() {
  const { idiomas, solo, seco } = args();
  const dic = await cargarDiccionario();
  const claves = Object.keys(dic).filter((k) => !solo || k.startsWith(solo));
  const key = seco ? null : llave();
  if (!seco && !key) {
    console.error("Falta GEMINI_API_KEY (variable de entorno o ~/.config/maven/gemini.env).");
    process.exit(2);
  }

  let totalHechas = 0, totalSaltadas = 0;
  for (const lang of idiomas) {
    const guardadas = leerTraducciones(lang);
    // Las claves que ya no existen en el diccionario se limpian.
    for (const k of Object.keys(guardadas)) if (!dic[k]) delete guardadas[k];
    const pendientes = claves.filter((k) => {
      const en = dic[k]?.en;
      return typeof en === "string" && en.trim() !== "" && guardadas[k]?.en !== en;
    });
    console.log(`${lang}: ${pendientes.length} pendientes de ${claves.length}`);
    if (seco || pendientes.length === 0) { if (!seco) escribirTraducciones(lang, guardadas); continue; }

    const tandas = [];
    for (let i = 0; i < pendientes.length; i += TANDA) tandas.push(pendientes.slice(i, i + TANDA));
    let siguiente = 0, hechas = 0, saltadas = 0;
    const trabajador = async () => {
      while (siguiente < tandas.length) {
        const tanda = tandas[siguiente++];
        const lote = Object.fromEntries(tanda.map((k) => [k, { en: dic[k].en, es: dic[k].es }]));
        let res;
        try {
          res = await pedir(key, lang, lote);
        } catch (e) {
          console.warn(`  ${lang}: tanda fallida (${e.message}); queda en inglés y se reintenta la próxima vez`);
          saltadas += tanda.length;
          continue;
        }
        for (const k of tanda) {
          const t = res?.[k];
          // Una traducción que pierde o inventa un {marcador} rompería la frase: se descarta.
          if (typeof t !== "string" || !t.trim() || marcadores(t) !== marcadores(dic[k].en)) { saltadas++; continue; }
          guardadas[k] = { t, en: dic[k].en };
          hechas++;
        }
        escribirTraducciones(lang, guardadas);
        process.stdout.write(`\r  ${lang}: ${hechas}/${pendientes.length} traducidas`);
      }
    };
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajador));
    escribirTraducciones(lang, guardadas);
    console.log(`\n  ${lang}: listo (${hechas} traducidas, ${saltadas} quedan en inglés)`);
    totalHechas += hechas; totalSaltadas += saltadas;
  }
  if (!seco) console.log(`Total: ${totalHechas} traducidas, ${totalSaltadas} en inglés por ahora.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
