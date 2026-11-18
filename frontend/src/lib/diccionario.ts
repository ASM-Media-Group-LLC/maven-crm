// EL DICCIONARIO FUENTE (español + inglés, escrito a mano).
//
// Desde el 16/11/2026 Maven va en 6 idiomas (en, es, de, fr, it, pt). Este
// archivo es la FUENTE: aquí se escriben las claves en español e inglés, como
// siempre. La app NO importa este archivo al correr: el plugin de Vite
// (scripts/i18n/vitePluginIdiomas.ts) lo lee al compilar y arma un paquete por
// idioma, y cada persona baja solo el suyo (lib/i18n.ts → cargarIdioma). Los
// otros cuatro idiomas salen de frontend/src/locales/<idioma>.json, que llena
// `node scripts/i18n/traducir.mjs` con IA.
//
// Las pruebas sí lo leen entero (test/setup.ts → registrarDiccionario).

import { navegacion } from "./i18n/navegacion";
import { comun } from "./i18n/comun";
import { chatCompartido } from "./i18n/chatCompartido";
import { permisos } from "./i18n/permisos";
import { telegram } from "./i18n/telegram";
import { whatsapp } from "./i18n/whatsapp";
import { creadoras } from "./i18n/creadoras";
import { dashboard } from "./i18n/dashboard";
import { ajustes } from "./i18n/ajustes";
import { auth } from "./i18n/auth";
import { pwa } from "./i18n/pwa";
import { calendario } from "./i18n/calendario";
import { correo } from "./i18n/correo";
import { oficina } from "./i18n/oficina";
import { messenger } from "./i18n/messenger";
import { contactos } from "./i18n/contactos";
import { closers } from "./i18n/closers";
import { promolog } from "./i18n/promolog";
import { tickets } from "./i18n/tickets";
import { chatters } from "./i18n/chatters";
import { leadgen } from "./i18n/leadgen";
import { hr } from "./i18n/hr";
import { finanzas } from "./i18n/finanzas";
import { agencyQa } from "./i18n/agencyQa";
import { admin } from "./i18n/admin";
import { creadoresFicha } from "./i18n/creadoresFicha";
import { cowork } from "./i18n/cowork";
import { scouter } from "./i18n/scouter";
import { apiKeys } from "./i18n/apiKeys";
import { compartido } from "./i18n/compartido";
import { hrGestion } from "./i18n/hrGestion";
import { internos } from "./i18n/internos";
import { paginas } from "./i18n/paginas";
import { ventas } from "./i18n/ventas";
import { portal } from "./i18n/portal";
import { centroOps } from "./i18n/centroOps";
import { vigilancia } from "./i18n/vigilancia";
import { conexionEquipo } from "./i18n/conexionEquipo";
import { portada } from "./i18n/portada";
import { guiaConexion } from "./i18n/guiaConexion";
import { guiaApp } from "./i18n/guiaApp";

// EL DICCIONARIO, PARTIDO POR MÓDULO.
//
// Hasta sep 2026 era un solo objeto de 1.400 líneas en este archivo. Con varios
// módulos traduciéndose a la vez, todos los PR tocaban el mismo archivo y
// chocaban entre sí. Ahora cada módulo tiene el suyo en lib/i18n/ y acá solo se
// arma la unión. Las claves no cambiaron: `t("common.save")` sigue igual.
//
//  - Clave nueva: va en el archivo de su módulo y empieza con uno de los
//    prefijos que ese archivo declara en su PREFIJOS_… ("promolog.x" →
//    lib/i18n/promolog.ts). Antes de inventarla, buscá en comun.ts: lo que se
//    repite entre módulos vive ahí.
//  - Módulo nuevo: archivo nuevo en lib/i18n/ con su objeto y su PREFIJOS_…, y
//    sumarlo a la lista de abajo. Si no se suma, sus claves no existen para t().
//
// Lo vigila test/i18n/diccionarioPorModulo.test.ts: ninguna clave en dos
// archivos, cada una con un prefijo de su archivo y con `es` y `en` escritos.
// Una clave repetida entre dos archivos NO la ve tsc (la segunda pisa a la
// primera en silencio); la ve ese test.
const translations = {
  ...navegacion,
  ...comun,
  ...chatCompartido,
  ...permisos,
  ...telegram,
  ...whatsapp,
  ...creadoras,
  ...dashboard,
  ...ajustes,
  ...auth,
  ...pwa,
  ...calendario,
  ...correo,
  ...oficina,
  ...messenger,
  ...contactos,
  ...closers,
  ...promolog,
  ...tickets,
  ...chatters,
  ...leadgen,
  ...hr,
  ...finanzas,
  ...agencyQa,
  ...admin,
  ...creadoresFicha,
  ...cowork,
  ...scouter,
  ...apiKeys,
  ...compartido,
  ...hrGestion,
  ...internos,
  ...paginas,
  ...ventas,
  ...portal,
  ...centroOps,
  ...vigilancia,
  ...conexionEquipo,
  ...portada,
  ...guiaConexion,
  ...guiaApp,
} as const;

export type TranslationKey = keyof typeof translations;

export default translations;
