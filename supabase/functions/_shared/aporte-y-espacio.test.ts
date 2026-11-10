import { assertEquals } from "jsr:@std/assert@1";
import {
  agruparPorLink, type ArchivoQueLlego, llaveDeModelo, nivelesPorAvisar, resumenDelDisco, tamanoLegible, textoDelAviso, tocaMuestra,
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
