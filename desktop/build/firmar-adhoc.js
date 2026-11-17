// Firma la app de Mac antes de armar el .dmg y el .zip.
//
// - En el CI (MAVEN_IDENTIDAD = huella del certificado Developer ID de Alvaro):
//   firma de verdad, con «hardened runtime» y sello de hora, como pide Apple
//   para notarizar. La firmamos aquí y no con electron-builder porque el Mac
//   del CI corre sin sesión de usuario y `security find-identity -v` da el
//   certificado por «no válido» aunque la cadena verifica bien (17/11/2026):
//   electron-builder se saltaba la firma y la app salía sin ninguna.
// - Armándola a mano sin certificado: firma «ad hoc». Sin ninguna firma, un Mac
//   con chip Apple dice que la app «está dañada»; con esta, macOS solo pide
//   permiso la primera vez (Ajustes → Privacidad y seguridad → Abrir igual).
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== "darwin") return;
  // Con CSC_LINK firma electron-builder (armado a mano con el .p12).
  if (process.env.CSC_LINK) return;
  // En la versión universal se firma solo la final (las de cada chip son temporales).
  if (/-temp$/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  // La carpeta del proyecto vive en iCloud/Documentos y le pega atributos que
  // codesign rechaza («detritus»): se limpian antes de firmar.
  execFileSync("xattr", ["-cr", app]);
  const identidad = process.env.MAVEN_IDENTIDAD;
  if (!identidad) {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
    return;
  }
  const permisos = path.join(__dirname, "entitlements.mac.plist");
  const args = ["--force", "--deep", "--options", "runtime", "--timestamp", "--entitlements", permisos, "--sign", identidad];
  if (process.env.CSC_KEYCHAIN) args.push("--keychain", process.env.CSC_KEYCHAIN);
  try {
    execFileSync("codesign", [...args, app], { stdio: "inherit" });
  } catch {
    // El Mac del CI corre sin sesión de usuario y codesign no llega a la raíz
    // de Apple (errSecInternalComponent, 17/11/2026). Mientras se arregla ese
    // Mac, sale con firma ad hoc: abre con «Abrir igual», como la primera versión.
    console.log("::warning::No se pudo firmar con el Developer ID; sale con firma ad hoc.");
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  }
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" });
};
