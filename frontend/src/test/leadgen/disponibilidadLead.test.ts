// El banner "¿se puede agregar este lead?" del alta de LeadGen, en los dos idiomas.
//
// El chequeo devuelve un motivo con sus datos y la frase se arma al dibujar
// (pages/leadgen/disponibilidadLead.ts). Hasta sep 2026 la armaba
// lib/lead-validation.ts ya escrita en español, y en EN el banner salía en
// español. Acá: en español, EXACTAMENTE las frases de antes (letra por letra, con
// los datos que la app de verdad le pasa); en inglés, ninguna palabra en español.
import { describe, it, expect, vi } from "vitest";
import { getTranslation, type Language } from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { textoDisponibilidad, haceCuanto, type DisponibilidadLead } from "@/pages/leadgen/disponibilidadLead";

const DIA = 24 * 60 * 60 * 1000;
// Un minuto de margen: "hace N días" se cuenta con floor().
const haceDias = (n: number) => new Date(Date.now() - n * DIA - 60_000).toISOString();
const traductor = (lang: Language) => (key: Parameters<typeof getTranslation>[0], params?: Record<string, string | number>) =>
  getTranslation(key, lang, params);

type Caso = { d: Exclude<DisponibilidadLead, { kind: "new" }>; es: [string, string]; en: [string, string] };

const CASOS: Caso[] = [
  {
    d: { kind: "blocked", motivo: "creadoraActiva", nombre: "Ana", status: "active" },
    es: ["Es modelo activa de la agencia", 'Ana ya es creadora con status "active". No se puede agregar como lead.'],
    en: ["She's an active model at the agency", 'Ana is already a creator with status "active". She can\'t be added as a lead.'],
  },
  {
    d: { kind: "allowed_with_history", motivo: "exCreadora", nombre: "Ana", status: "terminated", desde: haceDias(40) },
    es: ["Fue creadora de la agencia", "Ana está terminada hace 1 mes. Puedes volver a agregarla como lead."],
    en: ["She was a creator at the agency", "Ana was terminated 1 month ago. You can add her as a lead again."],
  },
  {
    d: { kind: "blocked", motivo: "exCreadora", nombre: null, status: "leaving", desde: haceDias(5), faltanDias: 25 },
    es: [
      "Fue creadora — espera",
      "Esta modelo está en retiro hace 5 días. Hay que esperar 30 días desde el cambio de estado — faltan 25 días.",
    ],
    en: [
      "Former creator — wait",
      "This model started leaving the agency 5 days ago. You have to wait 30 days from the status change — 25 days to go.",
    ],
  },
  {
    // Un día: el singular (antes decía "faltan 1 días").
    d: { kind: "blocked", motivo: "exCreadora", nombre: "Ana", status: "terminated", desde: haceDias(29), faltanDias: 1 },
    es: [
      "Fue creadora — espera",
      "Ana está terminada hace 29 días. Hay que esperar 30 días desde el cambio de estado — falta 1 día.",
    ],
    en: [
      "Former creator — wait",
      "Ana was terminated 29 days ago. You have to wait 30 days from the status change — 1 day to go.",
    ],
  },
  {
    d: { kind: "blocked", motivo: "otraCreadora", nombre: null, status: "draft" },
    es: ["Ya existe en creadoras", 'Esta modelo ya tiene un registro en creadoras con status "draft".'],
    en: ["Already in Creators", 'This model already has a record in Creators with status "draft".'],
  },
  {
    // La etapa se guarda en español ("Asignada"): en inglés se muestra su etiqueta.
    d: { kind: "blocked", motivo: "enCierre", stage: "Asignada", closer: "Pedro Ruiz" },
    es: [
      "Está en proceso de cierre",
      'Esta modelo está en stage "Asignada" en Closers · Closer: Pedro Ruiz. No se puede agregar como lead.',
    ],
    en: [
      "She's in the closing process",
      'This model is in the "Assigned" stage in Closers · Closer: Pedro Ruiz. She can\'t be added as a lead.',
    ],
  },
  {
    d: { kind: "allowed_with_history", motivo: "cierreFallido", desde: haceDias(90) },
    es: ["Cierre previo fallido", 'Esta modelo fue marcada "No interesada" hace 3 meses. Puedes volver a agregarla como lead.'],
    en: ["Earlier close attempt failed", 'This model was marked "Not interested" 3 months ago. You can add her as a lead again.'],
  },
  {
    d: { kind: "blocked", motivo: "cierreFallido", desde: haceDias(1), faltanDias: 59 },
    es: [
      "Cierre fallido — espera",
      'Esta modelo fue marcada "No interesada" ayer. Hay que esperar 60 días desde entonces — faltan 59 días.',
    ],
    en: [
      "Failed close — wait",
      'This model was marked "Not interested" yesterday. You have to wait 60 days from then — 59 days to go.',
    ],
  },
  {
    d: { kind: "blocked", motivo: "duplicadoReciente", agente: "Laura Gomez", horas: 3, faltanHoras: 21 },
    es: ["Lead duplicado — espera", "Este lead fue agregado por Laura Gomez hace 3h. Podrás resubirlo en ~21h (regla 24h)."],
    en: ["Duplicate lead — wait", "This lead was added by Laura Gomez 3h ago. You can add it again in ~21h (24h rule)."],
  },
  {
    d: { kind: "allowed_with_history", motivo: "yaEnLeadgen", agente: "Laura Gomez", desde: haceDias(2) },
    es: [
      "Lead ya existente en LeadGen",
      "Este lead ya fue agregado por Laura Gomez hace 2 días. Se va a crear como entrada repetida (reactivado).",
    ],
    en: [
      "Lead already in LeadGen",
      "This lead was already added by Laura Gomez 2 days ago. It will be created as a repeat entry (reactivated).",
    ],
  },
  {
    d: { kind: "allowed_with_history", motivo: "yaEnLeadgen", agente: null, desde: null },
    es: ["Lead ya existente en LeadGen", "Este lead ya fue agregado. Se va a crear como entrada repetida (reactivado)."],
    en: ["Lead already in LeadGen", "This lead was already added. It will be created as a repeat entry (reactivated)."],
  },
  {
    d: { kind: "allowed_with_history", motivo: "scouter", desde: new Date().toISOString(), status: "new" },
    es: [
      "Encontrada por Scouter Assist",
      'Esta modelo fue descubierta por Scouter Assist (hoy) · status "new". Puedes agregarla como lead.',
    ],
    en: ["Found by Scouter Assist", 'This model was found by Scouter Assist (today) · status "new". You can add her as a lead.'],
  },
];

describe("el banner de disponibilidad del alta de lead", () => {
  it("en español dice exactamente lo de siempre", () => {
    for (const { d, es } of CASOS) {
      const { title, message } = textoDisponibilidad(traductor("es"), d);
      expect([title, message]).toEqual(es);
    }
  });

  it("en inglés está entero en inglés", () => {
    for (const { d, en } of CASOS) {
      const { title, message } = textoDisponibilidad(traductor("en"), d);
      expect([title, message]).toEqual(en);
      expect(esEspanol(title), title).toBe(false);
      expect(esEspanol(message), message).toBe(false);
    }
  });

  it("cubre todos los motivos", () => {
    const motivos = new Set(CASOS.map((c) => c.d.motivo));
    expect([...motivos].sort()).toEqual(
      ["cierreFallido", "creadoraActiva", "duplicadoReciente", "enCierre", "exCreadora", "otraCreadora", "scouter", "yaEnLeadgen"],
    );
  });

  it("el hace-cuánto en los dos idiomas", () => {
    const es = traductor("es");
    const en = traductor("en");
    expect([haceCuanto(es, haceDias(0)), haceCuanto(en, haceDias(0))]).toEqual(["hoy", "today"]);
    expect([haceCuanto(es, haceDias(1)), haceCuanto(en, haceDias(1))]).toEqual(["ayer", "yesterday"]);
    expect([haceCuanto(es, haceDias(12)), haceCuanto(en, haceDias(12))]).toEqual(["hace 12 días", "12 days ago"]);
    expect([haceCuanto(es, haceDias(31)), haceCuanto(en, haceDias(31))]).toEqual(["hace 1 mes", "1 month ago"]);
    expect([haceCuanto(es, haceDias(200)), haceCuanto(en, haceDias(200))]).toEqual(["hace 6 meses", "6 months ago"]);
  });
});
