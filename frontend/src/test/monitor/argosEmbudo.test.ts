import { describe, it, expect } from "vitest";
import {
  configEmbudo,
  despuesDeChica,
  camposArgos,
  parsearChica,
  pasoInicial,
  Presupuesto,
  presupuestoDe,
  saltoSinPresupuesto,
  type FiltroFoto,
} from "../../../../supabase/functions/argos-mirar/embudo";

// Alvaro, 19/11/2026: el embudo de Argos prendido de verdad (huella → lista →
// IA chica → Argos detallado), con interruptor, revisión al azar del 10 % y un
// tope de USD 1,50 al día que nunca se pasa.

const edge = Object.values(import.meta.glob("../../../../supabase/functions/argos-mirar/index.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const vigilante = Object.values(import.meta.glob("../../../../supabase/functions/salud-vigilante/index.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const migracion = Object.values(import.meta.glob("../../../../supabase/migrations/20261119083000_argos_embudo_prendido.sql", { query: "?raw", import: "default", eager: true }))[0] as string;

const PRENDIDO = configEmbudo({ activo: true, argos_filtros_activos: true, argos_revision_azar: 0.1 });
const APAGADO = configEmbudo({ activo: true, argos_filtros_activos: false, argos_revision_azar: 0.1 });
const SIN_MIGRACION = configEmbudo({ activo: true });
const SIN_AZAR = 0.99; // tiro que nunca cae en la revisión al azar

const foto = (p: Partial<FiltroFoto>): FiltroFoto => ({
  id: "f1", filtro: null, prev_veredicto: null, prev_fuera: null, app: null, titulo: null, lista_nota: null, ...p,
});

describe("embudo: la decisión foto por foto", () => {
  it("pantalla igual → copia el veredicto anterior, bueno o malo, sin IA", () => {
    const buena = pasoInicial(PRENDIDO, foto({ filtro: "igual", prev_veredicto: "CRM · chat", prev_fuera: false }), SIN_AZAR);
    expect(buena).toEqual({ tipo: "saltar", salto: { veredicto: "CRM · chat", fuera_de_lugar: false, juzgada_por: "filtro_igual", filtro_decia: "igual" } });
    const mala = pasoInicial(PRENDIDO, foto({ filtro: "igual", prev_veredicto: "Instagram · reels", prev_fuera: true }), SIN_AZAR);
    expect(mala.tipo === "saltar" && mala.salto.fuera_de_lugar).toBe(true);
  });

  it("app de la lista → trabajo, sin IA", () => {
    const p = pasoInicial(PRENDIDO, foto({ filtro: "lista", app: "Microsoft Edge", lista_nota: "Pestaña de OnlyFans" }), SIN_AZAR);
    expect(p).toEqual({ tipo: "saltar", salto: { veredicto: "Pestaña de OnlyFans · app de trabajo de la lista aprobada", fuera_de_lugar: false, juzgada_por: "filtro_lista", filtro_decia: "lista" } });
  });

  it("escritorio remoto / contenedor, sin app o sin dato del SQL → IA chica", () => {
    expect(pasoInicial(PRENDIDO, foto({ filtro: "contenedor", app: "AnyDesk" }), SIN_AZAR)).toEqual({ tipo: "ia_chica" });
    expect(pasoInicial(PRENDIDO, foto({}), SIN_AZAR)).toEqual({ tipo: "ia_chica" });
    expect(pasoInicial(PRENDIDO, undefined, SIN_AZAR)).toEqual({ tipo: "ia_chica" });
  });

  it("revisión al azar (10 %): lo que el embudo da por bueno va a Argos detallado, con el filtro de respaldo", () => {
    expect(PRENDIDO.azar).toBe(0.1);
    const p = pasoInicial(PRENDIDO, foto({ filtro: "igual", prev_veredicto: "CRM", prev_fuera: false }), 0.05);
    expect(p).toMatchObject({ tipo: "argos", juzgada_por: "argos_azar", filtro_decia: "igual" });
    const si = despuesDeChica(PRENDIDO, { respuesta: "si", sistema: "Sheets" }, 0.05);
    expect(si).toMatchObject({ tipo: "argos", juzgada_por: "argos_azar", filtro_decia: "ia_chica_si" });
    expect(configEmbudo({ argos_filtros_activos: true }).azar).toBe(0.1);
  });

  it("IA chica: «sí» decide; «no» y «no sé» van a Argos; si falla, Argos", () => {
    expect(despuesDeChica(PRENDIDO, { respuesta: "si", sistema: "Google Sheets" }, SIN_AZAR)).toEqual({
      tipo: "saltar",
      salto: { veredicto: "Google Sheets · herramienta de trabajo (revisión rápida)", fuera_de_lugar: false, juzgada_por: "ia_chica", filtro_decia: "ia_chica_si" },
    });
    expect(despuesDeChica(PRENDIDO, { respuesta: "no", sistema: "YouTube" }, SIN_AZAR)).toEqual({ tipo: "argos", juzgada_por: "argos", filtro_decia: "ia_chica_no" });
    expect(despuesDeChica(PRENDIDO, { respuesta: "no_se", sistema: "" }, SIN_AZAR)).toEqual({ tipo: "argos", juzgada_por: "argos", filtro_decia: "ia_chica_no_se" });
    expect(despuesDeChica(PRENDIDO, null, SIN_AZAR)).toEqual({ tipo: "argos", juzgada_por: "argos", filtro_decia: "ia_chica_error" });
  });

  it("lee la respuesta de la IA chica", () => {
    expect(parsearChica('{"trabajo":"sí","sistema":"Maven"}')).toEqual({ respuesta: "si", sistema: "Maven" });
    expect(parsearChica('```json\n{"trabajo":"no sé"}\n```')).toEqual({ respuesta: "no_se", sistema: "" });
    expect(parsearChica('{"trabajo":"no","sistema":"Netflix"}')?.respuesta).toBe("no");
    expect(parsearChica('{"trabajo":"tal vez"}')).toBeNull();
    expect(parsearChica("nada")).toBeNull();
  });
});

describe("interruptor: apagado = como antes del 19/11", () => {
  it("apagado o sin la migración, TODO va a Argos detallado, aunque el SQL diga igual o lista", () => {
    for (const cfg of [APAGADO, SIN_MIGRACION]) {
      for (const filtro of ["igual", "lista", "contenedor", null] as const) {
        expect(pasoInicial(cfg, foto({ filtro, prev_veredicto: "CRM", lista_nota: "Maven" }), 0)).toEqual({ tipo: "argos", juzgada_por: "argos", filtro_decia: null });
      }
    }
  });

  it("sin la migración no se escriben columnas nuevas (no rompe el update)", () => {
    expect(camposArgos(SIN_MIGRACION, { tipo: "argos", juzgada_por: "argos", filtro_decia: null })).toEqual({});
    expect(camposArgos(APAGADO, { tipo: "argos", juzgada_por: "argos", filtro_decia: null })).toEqual({ juzgada_por: "argos", filtro_decia: null });
  });

  it("la edge lee la config con select * y pregunta los filtros solo con el embudo prendido", () => {
    expect(edge).toMatch(/from\("monitor_config"\)\.select\("\*"\)/);
    expect(edge).toMatch(/if \(embudo\.activos\) \{\s*const \{ data: fs, error: fErr \} = await admin\.rpc\("argos_embudo_filtros"/);
    expect(migracion).toMatch(/argos_filtros_activos boolean not null default true/);
    expect(migracion).toMatch(/when not \(select activos from cfg\) then null/);
  });
});

describe("tope del día (USD 1,50): nunca se pasa", () => {
  it("reserva cada mirada antes de pedirla; si no cabe, no se pide", () => {
    const p = new Presupuesto(1.4978, 1.5);
    expect(p.reservar(0.0022)).toBe(true); // 1.5000
    expect(p.reservar(0.0003)).toBe(false);
    p.liberar(0.0022);
    expect(p.reservar(0.0003)).toBe(true);
    expect(p.usd).toBeLessThanOrEqual(1.5);
  });

  it("muchas miradas seguidas jamás pasan el tope", () => {
    const p = new Presupuesto(0, 1.5);
    let n = 0;
    while (p.reservar(n % 3 === 0 ? 0.0022 : 0.0003)) n++;
    expect(p.usd).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(n).toBeGreaterThan(1000);
  });

  it("desde el 70 % entra en ahorro: sin azar, la chica decide sola y Argos solo mira los «no»", () => {
    const p = new Presupuesto(1.05, 1.5);
    expect(p.ahorro).toBe(true);
    expect(new Presupuesto(1.0, 1.5).ahorro).toBe(false);
    expect(pasoInicial(PRENDIDO, foto({ filtro: "lista", lista_nota: "Maven" }), 0, true).tipo).toBe("saltar");
    expect(despuesDeChica(PRENDIDO, { respuesta: "si", sistema: "" }, 0, true).tipo).toBe("saltar");
    expect(despuesDeChica(PRENDIDO, { respuesta: "no_se", sistema: "" }, 0, true)).toMatchObject({
      tipo: "saltar", salto: { juzgada_por: "ia_chica", fuera_de_lugar: false, filtro_decia: "ia_chica_no_se" },
    });
    expect(despuesDeChica(PRENDIDO, { respuesta: "no", sistema: "YouTube" }, 0, true)).toMatchObject({ tipo: "argos", filtro_decia: "ia_chica_no" });
  });

  it("si Argos detallado no cabe: queda el filtro o la IA chica; si nadie miró, sin juzgar", () => {
    const azar = pasoInicial(PRENDIDO, foto({ filtro: "lista", lista_nota: "Maven" }), 0);
    expect(azar.tipo).toBe("argos");
    if (azar.tipo === "argos") expect(saltoSinPresupuesto(azar, null)?.juzgada_por).toBe("filtro_lista");
    const no = saltoSinPresupuesto({ tipo: "argos", juzgada_por: "argos", filtro_decia: "ia_chica_no" }, { respuesta: "no", sistema: "YouTube" });
    expect(no).toEqual({ veredicto: "YouTube · fuera de lugar (revisión rápida)", fuera_de_lugar: true, juzgada_por: "ia_chica", filtro_decia: "ia_chica_no" });
    expect(saltoSinPresupuesto({ tipo: "argos", juzgada_por: "argos", filtro_decia: null }, null)).toBeNull();
  });

  it("tope desde monitor_config; null = sin tope; si no se pudo leer el gasto, se toma como alcanzado", () => {
    const cfg = { argos_tope_dia_usd: "1.50", argos_precio_chica_usd: 0.0003 };
    const ok = presupuestoDe({ usd: 0.5, precio_foto: 0.0022, precio_chica: 0.0003, tope: 1.5 }, cfg);
    expect(ok.presupuesto.tope).toBe(1.5);
    expect(ok.presupuesto.usd).toBe(0.5);
    expect(ok.precioFoto).toBe(0.0022);
    expect(ok.precioChica).toBe(0.0003);
    const ciego = presupuestoDe(null, cfg);
    expect(ciego.presupuesto.reservar(0.0003)).toBe(false);
    expect(presupuestoDe({ usd: 50 }, { argos_tope_dia_usd: null }).presupuesto.reservar(0.0022)).toBe(true);
    expect(presupuestoDe(null, null).presupuesto.tope).toBeNull(); // sin migración: como antes
  });

  it("la edge reserva antes de cada mirada (chica y detallada) y la devuelve si falla", () => {
    // La primera mirada se reserva antes de bajar la foto; si la bajada falla, se devuelve.
    expect(edge).toMatch(/const reserva = paso\.tipo === "ia_chica" \? precioChica : precioFoto;\s*if \(!presupuesto\.reservar\(reserva\)\)/);
    expect(edge.indexOf("presupuesto.reservar(reserva)")).toBeLessThan(edge.indexOf('.from("monitor-capturas").download(ruta)'));
    expect(edge).toMatch(/if \(dl\.error \|\| !dl\.data\) \{\s*presupuesto\.liberar\(reserva\);/);
    expect(edge).toMatch(/if \(!chica\) presupuesto\.liberar\(precioChica\)/);
    expect(edge).toMatch(/paso\.tipo === "argos" && !presupuesto\.reservar\(precioFoto\)\) \{[\s\S]{0,200}saltoSinPresupuesto\(paso, chica\)/);
    expect(edge).toMatch(/const res = await juzgar\(promptDe\(f\.user_id\), b64\);\s*if \(!res\) \{\s*presupuesto\.liberar\(precioFoto\);/);
    expect(migracion).toMatch(/argos_tope_dia_usd numeric default 1\.50/);
    expect(migracion).toMatch(/argos_revision_azar numeric not null default 0\.10/);
  });

  it("el vigía de salud no avisa «Argos caído» cuando es el tope", () => {
    expect(vigilante).toMatch(/sin_juzgar_tope/);
  });
});

describe("la plata: solo cuentan las miradas de verdad", () => {
  it("el costo por foto: copia y lista no cuestan; la chica cuesta lo suyo; la detallada, 0,0022", () => {
    expect(migracion).toMatch(/create or replace function public\.argos_costo_foto/);
    expect(migracion).toMatch(/coalesce\(p_juzgada_por, 'argos'\) in \('argos', 'argos_azar'\)/);
    expect(migracion).toMatch(/p_filtro_decia in \('ia_chica_si', 'ia_chica_no', 'ia_chica_no_se'\)/);
    // El saldo y los costos por parte ya no cuentan «fotos con veredicto × precio».
    const saldo = migracion.slice(migracion.indexOf("function public.ia_saldo_calculo"));
    expect(saldo).toMatch(/sum\(public\.argos_costo_foto/);
  });

  it("escritorio remoto nunca se aprueba por el nombre (va antes que la copia y la lista)", () => {
    const i = migracion.indexOf("when d.remoto then 'contenedor'");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(migracion.indexOf("then 'igual'"));
    expect(migracion).toMatch(/anydesk\|teamviewer\|rustdesk\|parsec/);
    expect(migracion).toMatch(/chrome remote/);
  });
});
