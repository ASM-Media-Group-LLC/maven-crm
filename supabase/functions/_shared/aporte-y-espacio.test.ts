import { assertEquals } from "jsr:@std/assert@1";
import {
  agruparPorLink, type ArchivoQueLlego, esperaDeJuntar, JUNTAR_MINIMO_MS, llaveDeModelo, nivelesPorAvisar, ordenarPorLoQueFalta,
  partesQueFaltan, resumenDelDisco, tamanoLegible, textoDelAviso, tocaMuestra, tocaPedirJuntar,
} from "./aporte-y-espacio.ts";

Deno.test("la carpeta de la modelo casa con su grupo de chatters aunque cambie la grafía", () => {
  assertEquals(llaveDeModelo("MEEL_SILVERA"), llaveDeModelo("Meelsilvera"));
  assertEquals(llaveDeModelo("SASSY ANDREA"), llaveDeModelo("sassyandrea"));
  assertEquals(llaveDeModelo(null), "");
});

Deno.test("480 fotos de un link son UN aviso, con el total de archivos y bytes", () => {
  const llegaron: ArchivoQueLlego[] = Array.from({ length: 480 }, () => ({ token: "t1", carpeta: "c1", quien: "Lina", size: 1_000_000 }));
  llegaron.push({ token: "t2", carpeta: "c2", quien: null, size: 2_000_000_000 });
  const tandas = agruparPorLink(llegaron);
  assertEquals(tandas.length, 2);
  assertEquals(tandas[0], { token: "t1", carpeta: "c1", quienes: ["Lina"], archivos: 480, bytes: 480_000_000 });
});

Deno.test("el chatter recibe a quién pedirle el material; quien mandó el link, no", () => {
  const t = { token: "t", carpeta: "c", quienes: ["Lina"], archivos: 12, bytes: 1_400_000_000 };
  assertEquals(textoDelAviso(t, "LINAGALLEGOS", "Maria Villegas", false).message, "Lina subió 12 archivos (1,4 GB) a «LINAGALLEGOS».");
  assertEquals(textoDelAviso(t, "LINAGALLEGOS", "Maria Villegas", true).message,
    "Lina subió 12 archivos (1,4 GB) a «LINAGALLEGOS». Lo tiene Maria Villegas en el Drive.");
  assertEquals(textoDelAviso({ ...t, quienes: [], archivos: 1 }, "YOISNIA", null, true).title, "Llegó contenido de YOISNIA");
});

Deno.test("tamaños legibles", () => {
  assertEquals(tamanoLegible(924_000_000), "924 MB");
  assertEquals(tamanoLegible(34_060_000_000_000), "34 TB");
  assertEquals(tamanoLegible(500), "1 KB");
});

Deno.test("el disco suma solo las raíces que respondieron", () => {
  const r = resumenDelDisco([{ ok: true, total: 24e12, libre: 6.7e12 }, { ok: false }, { ok: true, total: 24e12, libre: 7.2e12 }]);
  assertEquals(r?.total, 48e12);
  assertEquals(r?.libre, 13.9e12);
  assertEquals(resumenDelDisco([{ ok: false }]), null);
});

Deno.test("una muestra por hora, no una cada 2 minutos", () => {
  const ahora = Date.parse("2026-11-10T16:00:00Z");
  assertEquals(tocaMuestra(null, ahora), true);
  assertEquals(tocaMuestra("2026-11-10T15:58:00Z", ahora), false);
  assertEquals(tocaMuestra("2026-11-10T15:00:00Z", ahora), true);
});

Deno.test("⚠️ el aviso de lleno sale UNA vez por nivel (80 y 90 %)", () => {
  assertEquals(nivelesPorAvisar(71, []), []);
  assertEquals(nivelesPorAvisar(80.2, []), [80]);
  assertEquals(nivelesPorAvisar(80.2, [80]), []);
  assertEquals(nivelesPorAvisar(93, [80]), [90]);
  assertEquals(nivelesPorAvisar(95, []), [80, 90]);
});

const GB = 1024 ** 3;

Deno.test("cuántas partes de 32 MB le faltan a un aporte", () => {
  assertEquals(partesQueFaltan(5 * 1024 * 1024, 0), 1);
  assertEquals(partesQueFaltan(50 * GB, 0), 1600);
  assertEquals(partesQueFaltan(50 * GB, 1590), 10);
  assertEquals(partesQueFaltan(50 * GB, 1600), 0);
  assertEquals(partesQueFaltan(0, 0), 1);
});

Deno.test("una foto no espera detrás de un video de 50 GB", () => {
  const video = { id: "video", size: 50 * GB, nas_parte: 0 };
  const foto = { id: "foto", size: 3 * 1024 * 1024, nas_parte: null };
  const otroVideo = { id: "otro", size: 2 * GB, nas_parte: 10 };
  const casiListo = { id: "casi", size: 50 * GB, nas_parte: 1600 };
  assertEquals(ordenarPorLoQueFalta([video, foto, otroVideo, casiListo]).map((a) => a.id), ["casi", "foto", "otro", "video"]);
  // Empate: el orden en que llegaron.
  const foto2 = { id: "foto2", size: 1024, nas_parte: null };
  assertEquals(ordenarPorLoQueFalta([foto, foto2]).map((a) => a.id), ["foto", "foto2"]);
});

Deno.test("⚠️ mientras el NAS junta un video grande no se le vuelve a pedir", () => {
  const ahora = Date.parse("2026-11-16T16:00:00Z");
  // Nunca se pidió: se pide.
  assertEquals(tocaPedirJuntar(null, 20 * GB, ahora), true);
  // Un video de 1 GB: espera el mínimo de 10 minutos.
  assertEquals(esperaDeJuntar(1 * GB), JUNTAR_MINIMO_MS);
  assertEquals(tocaPedirJuntar("2026-11-16T15:55:00Z", 1 * GB, ahora), false);
  assertEquals(tocaPedirJuntar("2026-11-16T15:49:00Z", 1 * GB, ahora), true);
  // Uno de 50 GB a 30 MB/s: ~28 minutos antes de volver a pedir.
  assertEquals(Math.round(esperaDeJuntar(50 * GB) / 60_000), 28);
  assertEquals(tocaPedirJuntar("2026-11-16T15:40:00Z", 50 * GB, ahora), false);
  assertEquals(tocaPedirJuntar("2026-11-16T15:30:00Z", 50 * GB, ahora), true);
  // Fecha rota: se pide (mejor pedir de más que quedar trabado).
  assertEquals(tocaPedirJuntar("no-es-fecha", 50 * GB, ahora), true);
});
