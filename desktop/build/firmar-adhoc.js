// Firma «ad hoc» (sin certificado) antes de armar el .dmg. Sin ninguna firma,
// un Mac con chip Apple dice que la app «está dañada»; con esta, macOS solo
// pide permiso la primera vez (Ajustes → Privacidad y seguridad → Abrir igual).
// En el CI la app sale firmada con el Developer ID de Alvaro y notarizada por
// Apple (17/11/2026); esto queda solo para armarla a mano sin el certificado.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== "darwin") return;
  // Con el certificado de Apple (en el CI) firma electron-builder de verdad.
  if (process.env.CSC_LINK || process.env.MAVEN_FIRMA_REAL) return;
  // En la versión universal se firma solo la final (las de cada chip son temporales).
  if (/-temp$/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  // La carpeta del proyecto vive en iCloud/Documentos y le pega atributos que
  // codesign rechaza («detritus»): se limpian antes de firmar.
  execFileSync("xattr", ["-cr", app]);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
