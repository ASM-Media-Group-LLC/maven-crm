// cloudphone-gateway — Slice 1 (de-risk)
// Propósito: probar la cadena REAL en el VPS: arrancar un cloud phone (vía el agente MLX
// headless, launcher local :45001) -> adb connect + glogin -> capturar 1 frame PNG.
// NO embebe ni streamea todavía (eso es Slice 2). NO toca Maven.
//
// Honestidad: las funciones marcadas [CONFIRMAR] dependen de comandos exactos de xcli/launcher
// que se validan corriendo el contenedor (ese es justamente el objetivo del Slice 1). El tramo
// de adb (connect/glogin/screencap) sí está definido por la doc oficial.

const express = require("express");
const { execFile } = require("child_process");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 8090;
const SPIKE_TOKEN = process.env.SPIKE_TOKEN || ""; // protege el endpoint de prueba (arranca teléfonos = gasta minutos)

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 90000, maxBuffer: 1024 * 1024 * 64, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

// [CONFIRMAR] Arrancar un MOBILE profile. El endpoint de browser documentado es
//   GET launcher.mlx.yt:45001/api/v2/profile/f/{folder}/p/{profile}/start
// pero el de MOBILE + cómo obtener el ADB hay que confirmarlo (probablemente vía `xcli`).
async function startProfile(folderId, profileId) {
  // TODO(slice1): reemplazar por el comando real de xcli para mobile (confirmar con `xcli --help`
  // dentro del contenedor). Tentativo:
  const { stdout } = await sh("xcli", ["profile", "start", "-f", folderId, "-p", profileId]);
  return stdout.toString();
}

// [CONFIRMAR] Obtener IP:PORT + password de ADB del profile corriendo.
// En la GUI sale al hacer hover del ícono verde (IP/port/password). Programático: confirmar
// el comando de xcli/launcher que lo expone.
async function getAdbInfo(/* profileId */) {
  throw new Error(
    "getAdbInfo: pendiente de confirmar el comando xcli/launcher en runtime (Slice 1). " +
      "Correr `xcli --help` / `xcli profile --help` dentro del contenedor para descubrirlo.",
  );
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "cloudphone-gateway", slice: 1, ts: new Date().toISOString() }),
);

// Diagnóstico del entorno: confirma que xcli/adb existen y el agente responde. Sin secretos.
app.get("/diag", async (_req, res) => {
  const out = {};
  for (const [k, cmd, args] of [
    ["adb", "adb", ["--version"]],
    ["xcli", "xcli", ["--version"]],
  ]) {
    try {
      const { stdout } = await sh(cmd, args);
      out[k] = String(stdout).split("\n")[0];
    } catch (e) {
      out[k] = `ERR: ${e.message}`;
    }
  }
  res.json({ ok: true, tools: out });
});

// Prueba de la cadena completa: start -> adb connect -> glogin -> screencap (1 frame PNG base64).
// Protegido por SPIKE_TOKEN porque arrancar un teléfono consume minutos de cloud.
app.post("/spike/capture", async (req, res) => {
  if (!SPIKE_TOKEN || req.get("x-spike-token") !== SPIKE_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const { folderId, profileId } = req.body || {};
  if (!folderId || !profileId) {
    return res.status(400).json({ ok: false, error: "folderId y profileId requeridos" });
  }
  const log = [];
  try {
    log.push("startProfile…");
    await startProfile(folderId, profileId);
    log.push("getAdbInfo…");
    const { host, port, password } = await getAdbInfo(profileId);
    const target = `${host}:${port}`;
    log.push(`adb connect ${target}`);
    await sh("adb", ["connect", target]);
    log.push("glogin…");
    await sh("adb", ["-s", target, "shell", "glogin", password]);
    log.push("screencap…");
    const { stdout } = await sh("adb", ["-s", target, "exec-out", "screencap", "-p"], { encoding: "buffer" });
    const png = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    return res.json({ ok: true, log, frameBytes: png.length, framePngBase64: png.toString("base64") });
  } catch (e) {
    return res.status(500).json({ ok: false, log, error: e.message, stderr: e.stderr && String(e.stderr) });
  }
});

app.listen(PORT, () => console.log(`cloudphone-gateway escuchando en :${PORT}`));
