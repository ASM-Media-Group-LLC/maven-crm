// rec-server — sirve y borra las GRABACIONES que egress deja en el disco
// del VPS. Sin dependencias: node puro (http + crypto + fs).
//
// SEGURIDAD: nada acá es público. Toda operación exige una firma HMAC
// que solo saben las edge functions (RECORDINGS_SIGNING_SECRET). El link
// que recibe una persona es firmado y VENCE — el permiso de fondo vive en
// la base (RLS de meeting_recordings); esto solo entrega bytes a quien ya
// pasó ese control.
//
//   GET    /d/{archivo}?exp={epoch}&sig={hmac}   → descarga (mp4)
//   GET    /stat/{archivo}?exp&sig               → { size }
//   DELETE /f/{archivo}?exp&sig                  → borra el archivo
//   GET    /health                               → ok + espacio usado
//
// La firma cubre `${archivo}.${exp}` — un link no sirve para otro archivo
// ni después de vencer.

import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, unlink, readdir } from "node:fs/promises";
import path from "node:path";

const DIR = process.env.RECORDINGS_DIR || "/out";
const SECRET = process.env.RECORDINGS_SIGNING_SECRET;
const PORT = Number(process.env.PORT || 8080);

if (!SECRET) {
  console.error("Falta RECORDINGS_SIGNING_SECRET");
  process.exit(1);
}

function firmaValida(archivo, exp, sig) {
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false; // vencido
  const esperada = createHmac("sha256", SECRET).update(`${archivo}.${exp}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(esperada), Buffer.from(sig));
  } catch {
    return false;
  }
}

/** El nombre de archivo viene de la URL: sin esto, ../../etc/passwd. */
function archivoSeguro(nombre) {
  const limpio = path.basename(nombre);
  if (!/^[a-zA-Z0-9._-]+\.mp4$/.test(limpio)) return null;
  return limpio;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const partes = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/health") {
    try {
      const archivos = await readdir(DIR);
      let total = 0;
      for (const a of archivos) {
        try { total += (await stat(path.join(DIR, a))).size; } catch { /* borrado en el medio */ }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, archivos: archivos.length, bytes: total }));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e?.message ?? e));
    }
    return;
  }

  const accion = partes[0];
  const archivo = archivoSeguro(partes[1] ?? "");
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");

  if (!archivo || !firmaValida(archivo, exp, sig)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  const ruta = path.join(DIR, archivo);

  try {
    if (accion === "d" && req.method === "GET") {
      const st = await stat(ruta);
      res.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": st.size,
        // attachment: el navegador la DESCARGA (el objetivo es que la
        // gente se lleve el archivo antes de los 90 días).
        "content-disposition": `attachment; filename="${archivo}"`,
      });
      createReadStream(ruta).pipe(res);
      return;
    }
    if (accion === "stat" && req.method === "GET") {
      const st = await stat(ruta);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ size: st.size }));
      return;
    }
    if (accion === "f" && req.method === "DELETE") {
      await unlink(ruta);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  } catch (e) {
    const noExiste = e?.code === "ENOENT";
    res.writeHead(noExiste ? 404 : 500);
    res.end(noExiste ? "not found" : String(e?.message ?? e));
  }
}).listen(PORT, () => console.log(`rec-server en :${PORT}, sirviendo ${DIR}`));
