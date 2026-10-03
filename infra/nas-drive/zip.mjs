// Un .zip armado MIENTRAS se manda, para «Descargar» varios archivos del Drive
// (María Villegas, 02/10: como Google, que baja todo lo elegido en un .zip).
//
// Cero dependencias, como el resto del NAS. Las decisiones:
//
// - STORE (sin comprimir): fotos, videos y PDF ya vienen comprimidos; volver a
//   comprimirlos gasta CPU de la mini y no ahorra casi nada.
// - El CRC-32 se calcula al pasar los bytes, así que va DESPUÉS de los datos
//   (bit 3 + «data descriptor»): leer cada archivo dos veces para saberlo antes
//   duplicaría la lectura de los discos (50 GB serían 100).
// - ZIP64 donde hace falta: un video crudo pasa los 4 GB, y el .zip entero
//   también. Un archivo de 4 GB o más lleva el campo ZIP64 YA en la cabecera
//   local (el tamaño se sabe por stat) y por eso su descriptor va con tamaños
//   de 8 bytes: es la combinación que exige la norma (APPNOTE 4.3.9) y la que
//   leen unzip, Windows y el Archive Utility del Mac.
// - Nombres en UTF-8 (bit 11): «Contabilidad/Año 2026/Balance.pdf».
//
// La norma: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT

import zlib from "node:zlib";

/** Lo más grande que entra en un campo de 4 bytes; ese mismo valor es la
 *  marca de «mira el campo ZIP64», así que también lo necesita. */
export const LIMITE_32 = 0xffffffff;
const LIMITE_16 = 0xffff;

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_DESCRIPTOR = 0x08074b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN_64 = 0x06064b50;
const FIRMA_LOCALIZADOR_64 = 0x07064b50;
const FIRMA_FIN = 0x06054b50;

const BIT_DESCRIPTOR = 0x0008;
const BIT_UTF8 = 0x0800;
const VERSION_NORMAL = 20;
const VERSION_ZIP64 = 45;
/** «Hecho en Unix» (3) con la versión 4.5: así los permisos de abajo valen. */
const HECHO_POR = (3 << 8) | VERSION_ZIP64;
const MODO_ARCHIVO = 0o100644;
const MODO_CARPETA = 0o040755;

// ── CRC-32 ──────────────────────────────────────────────────────────────────
// El de zlib (Node ≥ 20.15/22.2) va en C y es mucho más rápido. El de JS queda
// por si la mini tiene un Node más viejo: el resultado es el mismo (test).

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Js(buf, previo = 0) {
  let c = (previo ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const crc32 = typeof zlib.crc32 === "function" ? (buf, previo = 0) => zlib.crc32(buf, previo) : crc32Js;

// ── Fechas ──────────────────────────────────────────────────────────────────

/** Fecha y hora de MS-DOS (hora local, de a 2 segundos). Antes de 1980 no
 *  existe: se usa el 1/1/1980. */
export function fechaDos(fecha) {
  const d = fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
  if (d.getFullYear() < 1980) return { hora: 0, dia: (1 << 5) | 1 };
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    dia: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** El campo «UT» (0x5455): la fecha en segundos Unix (UTC). Con él, unzip y el
 *  Mac ponen la fecha exacta y no la hora local de la mini. */
function campoFecha(fecha) {
  const s = Math.max(0, Math.min(0x7fffffff, Math.floor((fecha?.getTime?.() ?? Date.now()) / 1000)));
  const b = Buffer.alloc(9);
  b.writeUInt16LE(0x5455, 0);
  b.writeUInt16LE(5, 2);
  b.writeUInt8(1, 4); // solo la fecha de modificación
  b.writeUInt32LE(s, 5);
  return b;
}

// ── Las piezas del .zip ─────────────────────────────────────────────────────

/** ¿Este archivo necesita ZIP64 en su cabecera local? Se decide por el tamaño,
 *  que se sabe ANTES de mandar un byte. */
export const necesitaZip64 = (size) => size >= LIMITE_32;

/** La cabecera local de un archivo (o una carpeta). Con descriptor: CRC y
 *  tamaños en cero acá, van después de los datos. */
export function cabeceraLocal({ nombre, fecha, carpeta = false, zip64 = false }) {
  const n = Buffer.from(nombre, "utf8");
  const extras = [campoFecha(fecha)];
  if (zip64) {
    // 4.5.3: en la cabecera local, el campo ZIP64 lleva LOS DOS tamaños. Van
    // en cero (los de verdad están en el descriptor) y su presencia es la que
    // dice que el descriptor usa 8 bytes.
    const z = Buffer.alloc(20);
    z.writeUInt16LE(0x0001, 0);
    z.writeUInt16LE(16, 2);
    extras.unshift(z);
  }
  const extra = Buffer.concat(extras);
  const { hora, dia } = fechaDos(fecha);
  const b = Buffer.alloc(30);
  b.writeUInt32LE(FIRMA_LOCAL, 0);
  b.writeUInt16LE(zip64 ? VERSION_ZIP64 : VERSION_NORMAL, 4);
  b.writeUInt16LE(BIT_UTF8 | (carpeta ? 0 : BIT_DESCRIPTOR), 6);
  b.writeUInt16LE(0, 8); // STORE
  b.writeUInt16LE(hora, 10);
  b.writeUInt16LE(dia, 12);
  b.writeUInt32LE(0, 14); // CRC: en el descriptor
  b.writeUInt32LE(zip64 ? LIMITE_32 : 0, 18);
  b.writeUInt32LE(zip64 ? LIMITE_32 : 0, 22);
  b.writeUInt16LE(n.length, 26);
  b.writeUInt16LE(extra.length, 28);
  return Buffer.concat([b, n, extra]);
}

/** Lo que va después de los datos: el CRC y los tamaños de verdad. */
export function descriptor({ crc, size, zip64 = false }) {
  if (zip64) {
    const b = Buffer.alloc(24);
    b.writeUInt32LE(FIRMA_DESCRIPTOR, 0);
    b.writeUInt32LE(crc >>> 0, 4);
    b.writeBigUInt64LE(BigInt(size), 8);
    b.writeBigUInt64LE(BigInt(size), 16);
    return b;
  }
  const b = Buffer.alloc(16);
  b.writeUInt32LE(FIRMA_DESCRIPTOR, 0);
  b.writeUInt32LE(crc >>> 0, 4);
  b.writeUInt32LE(size, 8);
  b.writeUInt32LE(size, 12);
  return b;
}

/** La ficha de cada entrada en el directorio central (al final del .zip).
 *  ZIP64 si el tamaño o el lugar donde empieza no entran en 4 bytes. */
export function entradaCentral({ nombre, fecha, carpeta = false, crc = 0, size = 0, desde, zip64Local = false, forzarZip64 = false }) {
  const n = Buffer.from(nombre, "utf8");
  const tamanoGrande = forzarZip64 || size >= LIMITE_32;
  const lugarGrande = forzarZip64 || desde >= LIMITE_32;
  const extras = [campoFecha(fecha)];
  if (tamanoGrande || lugarGrande) {
    // 4.5.3: solo los campos que quedaron en 0xFFFFFFFF, y en este orden.
    const campos = [];
    if (tamanoGrande) campos.push(size, size);
    if (lugarGrande) campos.push(desde);
    const z = Buffer.alloc(4 + campos.length * 8);
    z.writeUInt16LE(0x0001, 0);
    z.writeUInt16LE(campos.length * 8, 2);
    campos.forEach((v, i) => z.writeBigUInt64LE(BigInt(v), 4 + i * 8));
    extras.unshift(z);
  }
  const extra = Buffer.concat(extras);
  const { hora, dia } = fechaDos(fecha);
  const b = Buffer.alloc(46);
  b.writeUInt32LE(FIRMA_CENTRAL, 0);
  b.writeUInt16LE(HECHO_POR, 4);
  b.writeUInt16LE(zip64Local || tamanoGrande || lugarGrande ? VERSION_ZIP64 : VERSION_NORMAL, 6);
  b.writeUInt16LE(BIT_UTF8 | (carpeta ? 0 : BIT_DESCRIPTOR), 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(hora, 12);
  b.writeUInt16LE(dia, 14);
  b.writeUInt32LE(crc >>> 0, 16);
  b.writeUInt32LE(tamanoGrande ? LIMITE_32 : size, 20);
  b.writeUInt32LE(tamanoGrande ? LIMITE_32 : size, 24);
  b.writeUInt16LE(n.length, 28);
  b.writeUInt16LE(extra.length, 30);
  b.writeUInt16LE(0, 32); // sin comentario
  b.writeUInt16LE(0, 34); // disco 0
  b.writeUInt16LE(0, 36);
  // Atributos: el modo de Unix arriba y, para Windows, la marca de carpeta.
  b.writeUInt32LE((((carpeta ? MODO_CARPETA : MODO_ARCHIVO) << 16) | (carpeta ? 0x10 : 0)) >>> 0, 38);
  b.writeUInt32LE(lugarGrande ? LIMITE_32 : desde, 42);
  return Buffer.concat([b, n, extra]);
}

/** El cierre: dónde empieza el directorio central y cuántas entradas tiene.
 *  Con ZIP64 si algo de eso no entra en el registro de siempre. */
export function cierre({ entradas, inicioCentral, tamanoCentral, forzarZip64 = false }) {
  const grande = forzarZip64 || entradas >= LIMITE_16 || inicioCentral >= LIMITE_32 || tamanoCentral >= LIMITE_32;
  const partes = [];
  if (grande) {
    const inicioFin64 = inicioCentral + tamanoCentral;
    const r = Buffer.alloc(56);
    r.writeUInt32LE(FIRMA_FIN_64, 0);
    r.writeBigUInt64LE(44n, 4); // lo que sigue de este registro
    r.writeUInt16LE(HECHO_POR, 12);
    r.writeUInt16LE(VERSION_ZIP64, 14);
    r.writeUInt32LE(0, 16);
    r.writeUInt32LE(0, 20);
    r.writeBigUInt64LE(BigInt(entradas), 24);
    r.writeBigUInt64LE(BigInt(entradas), 32);
    r.writeBigUInt64LE(BigInt(tamanoCentral), 40);
    r.writeBigUInt64LE(BigInt(inicioCentral), 48);
    const l = Buffer.alloc(20);
    l.writeUInt32LE(FIRMA_LOCALIZADOR_64, 0);
    l.writeUInt32LE(0, 4);
    l.writeBigUInt64LE(BigInt(inicioFin64), 8);
    l.writeUInt32LE(1, 16);
    partes.push(r, l);
  }
  const f = Buffer.alloc(22);
  f.writeUInt32LE(FIRMA_FIN, 0);
  f.writeUInt16LE(0, 4);
  f.writeUInt16LE(0, 6);
  f.writeUInt16LE(Math.min(entradas, LIMITE_16), 8);
  f.writeUInt16LE(Math.min(entradas, LIMITE_16), 10);
  f.writeUInt32LE(grande ? LIMITE_32 : tamanoCentral, 12);
  f.writeUInt32LE(grande ? LIMITE_32 : inicioCentral, 16);
  f.writeUInt16LE(0, 20);
  partes.push(f);
  return Buffer.concat(partes);
}

/**
 * El .zip entero, de a pedazos: un generador que se consume con
 * `Readable.from(...)`. Si el navegador corta, el que consume deja de pedir y
 * el generador se cierra: el archivo que se estaba leyendo se cierra con él y
 * no se lee un byte más.
 *
 * entradas: { nombre, fecha, carpeta: true }
 *         | { nombre, fecha, size, abrir: () => AsyncIterable<Buffer> }
 * opciones.forzarZip64: todo con ZIP64 (para probarlo sin escribir 4 GB).
 */
export async function* armarZip(entradas, { forzarZip64 = false } = {}) {
  const centrales = [];
  let lugar = 0;
  for (const e of entradas) {
    const desde = lugar;
    if (e.carpeta) {
      const cab = cabeceraLocal({ nombre: e.nombre, fecha: e.fecha, carpeta: true, zip64: forzarZip64 });
      lugar += cab.length;
      yield cab;
      centrales.push(entradaCentral({ nombre: e.nombre, fecha: e.fecha, carpeta: true, desde, zip64Local: forzarZip64, forzarZip64 }));
      continue;
    }
    const zip64 = forzarZip64 || necesitaZip64(e.size);
    const cab = cabeceraLocal({ nombre: e.nombre, fecha: e.fecha, zip64 });
    lugar += cab.length;
    yield cab;
    let crc = 0;
    let leidos = 0;
    if (e.size > 0) {
      for await (const pedazo of e.abrir()) {
        crc = crc32(pedazo, crc);
        leidos += pedazo.length;
        lugar += pedazo.length;
        yield pedazo;
      }
    }
    // El tamaño ya se anunció (ZIP64 o no): si el archivo cambió en el medio,
    // el .zip quedaría mintiendo. Mejor cortarlo.
    if (leidos !== e.size) throw new Error(`«${e.nombre}» cambió de tamaño mientras se armaba el .zip`);
    const desc = descriptor({ crc, size: e.size, zip64 });
    lugar += desc.length;
    yield desc;
    centrales.push(entradaCentral({ nombre: e.nombre, fecha: e.fecha, crc, size: e.size, desde, zip64Local: zip64, forzarZip64 }));
  }
  const inicioCentral = lugar;
  let tamanoCentral = 0;
  for (const c of centrales) {
    tamanoCentral += c.length;
    yield c;
  }
  yield cierre({ entradas: centrales.length, inicioCentral, tamanoCentral, forzarZip64 });
}

/**
 * Cuántos bytes va a tener el .zip, ANTES de mandar uno (el Content-Length):
 * con STORE (sin comprimir) los datos van tal cual y el tamaño de cada
 * archivo se sabe por stat, así que el largo sale de sumar las mismas piezas
 * que arma armarZip, con las MISMAS funciones (no una cuenta aparte que se
 * pueda desfasar). Con el total, el navegador muestra el avance de verdad
 * (la barra del Drive y la de descargas del navegador). Si un archivo cambia
 * de tamaño a mitad de camino, armarZip corta (el total ya se anunció).
 */
export function tamanoDelZip(entradas, { forzarZip64 = false } = {}) {
  let lugar = 0;
  let tamanoCentral = 0;
  for (const e of entradas) {
    const desde = lugar;
    if (e.carpeta) {
      lugar += cabeceraLocal({ nombre: e.nombre, fecha: e.fecha, carpeta: true, zip64: forzarZip64 }).length;
      tamanoCentral += entradaCentral({ nombre: e.nombre, fecha: e.fecha, carpeta: true, desde, zip64Local: forzarZip64, forzarZip64 }).length;
      continue;
    }
    const zip64 = forzarZip64 || necesitaZip64(e.size);
    lugar += cabeceraLocal({ nombre: e.nombre, fecha: e.fecha, zip64 }).length
      + e.size
      + descriptor({ crc: 0, size: e.size, zip64 }).length;
    tamanoCentral += entradaCentral({ nombre: e.nombre, fecha: e.fecha, size: e.size, desde, zip64Local: zip64, forzarZip64 }).length;
  }
  return lugar + tamanoCentral + cierre({ entradas: entradas.length, inicioCentral: lugar, tamanoCentral, forzarZip64 }).length;
}
