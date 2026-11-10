// Datos REALES de las cuatro lecturas de la página del NAS (10/11/2026), para el
// banco visual (/harness.html?ver=nas-pagina). Recortados a lo que se dibuja.
import type { EntroSemana, HistoriaNas, PorModelo, QueLiberar } from "@/lib/espacioNas";

const M = (mes: string, bytes: number, total: number) => ({ mes, bytes, total });
export const HISTORIA_REAL: HistoriaNas = {
  meses: [
    M("2024-12", 976569410657, 19905827171257), M("2025-01", 189303473422, 20095130644679), M("2025-02", 862007815683, 20957138460362),
    M("2025-03", 533101740963, 21490240201325), M("2025-04", 320508741750, 21810748943075), M("2025-05", 183055427340, 21993804370415),
    M("2025-06", 206227133535, 22200031503950), M("2025-07", 230130919189, 22430162423139), M("2025-08", 1267426875080, 23697589298219),
    M("2025-09", 515222274579, 24212811572798), M("2025-10", 767482434724, 24980294007522), M("2025-11", 1203259113426, 26183553120948),
    M("2025-12", 1064130795631, 27247683916579), M("2026-01", 1141261784071, 28388945700650), M("2026-02", 595771187100, 28984716887750),
    M("2026-03", 578474849721, 29563191737471), M("2026-04", 768683267772, 30331875005243), M("2026-05", 546671844236, 30878546849479),
    M("2026-06", 636128715339, 31514675564818), M("2026-07", 606070416901, 32120745981719), M("2026-08", 303209947718, 32423955929437),
    M("2026-09", 432422757768, 32856378687205), M("2026-10", 277526662628, 33133905349833), M("2026-11", 38637954319, 33172543304152),
  ],
  muestras: [{ dia: "2026-11-10", total: 47999866503168, usado: 34060559220736 }],
};

export const SEMANA_REAL: EntroSemana = {
  total: { bytes: 20002703417, archivos: 1433 },
  por_dia: [
    { dia: "2026-11-03", bytes: 51975211, archivos: 29 }, { dia: "2026-11-04", bytes: 5913755628, archivos: 324 },
    { dia: "2026-11-05", bytes: 10072711219, archivos: 251 }, { dia: "2026-11-06", bytes: 2544696564, archivos: 611 },
    { dia: "2026-11-07", bytes: 343424671, archivos: 58 }, { dia: "2026-11-08", bytes: 614101060, archivos: 127 },
    { dia: "2026-11-09", bytes: 460793051, archivos: 32 }, { dia: "2026-11-10", bytes: 1246013, archivos: 1 },
  ],
  por_modelo: [
    { nombre: "SCRIPT", padre: "YOISNIA", carpeta_id: "4d523f4c", bytes: 3146021119, archivos: 124, pidio: "Maria Villegas" },
    { nombre: "BUENOS DÍAS", padre: "SCRIPT", carpeta_id: "efe19d87", bytes: 2186925684, archivos: 9, pidio: "Maria Villegas" },
    { nombre: "MORAMAY", padre: "CONTENIDO MASSIVE", carpeta_id: "f599db67", bytes: 608166772, archivos: 51, pidio: "Maria Villegas" },
    { nombre: "ELLIE06", padre: "CONTENIDO MASSIVE", carpeta_id: "5b131026", bytes: 521023298, archivos: 91, pidio: "Maria Villegas" },
    { nombre: "LINAGALLEGOS", padre: "CONTENIDO PLUS", carpeta_id: "d7c3b50a", bytes: 324741671, archivos: 28, pidio: "Maria Villegas" },
    { nombre: "VEROODLE", padre: "CONTENIDO MASSIVE", carpeta_id: "93f4b89e", bytes: 318217533, archivos: 6, pidio: "Katherin Ferrer" },
    { nombre: "MIMIMOUSE", padre: "CONTENIDO MASSIVE", carpeta_id: "e8f06045", bytes: 162589942, archivos: 311, pidio: "Maria Villegas" },
  ],
  por_persona: [
    { nombre: "Lorena Lozano", bytes: 4600748445, archivos: 242 }, { nombre: "Maria Villegas", bytes: 3929697269, archivos: 53 },
    { nombre: "Katherin Ferrer", bytes: 2066507932, archivos: 76 }, { nombre: "David Aunta", bytes: 594805757, archivos: 97 },
    { nombre: "Carolina Jaramillo", bytes: 273530258, archivos: 47 }, { nombre: "Isabel Tuiran", bytes: 135571764, archivos: 38 },
  ],
};

export const MODELOS_REAL: PorModelo = {
  usado: 33172543304152, cuantas: 168, atribuido: 5809641441154,
  modelos: [
    { nombre: "MartinaSmith", bytes: 678144697648, archivos: 5377, carpetas: 8 },
    { nombre: "Heidygarcia1111", bytes: 287606181162, archivos: 3139, carpetas: 6 },
    { nombre: "LINAGALLEGOS", bytes: 245992971694, archivos: 7062, carpetas: 5 },
    { nombre: "Aliciatrece", bytes: 239697771407, archivos: 473, carpetas: 9 },
    { nombre: "michelleconstanza", bytes: 230495810050, archivos: 2566, carpetas: 8 },
    { nombre: "Noelia Arias", bytes: 207200256469, archivos: 6468, carpetas: 9 },
    { nombre: "Pamerodriguezv", bytes: 192964658952, archivos: 1606, carpetas: 4 },
    { nombre: "Milionlyvip", bytes: 187234265210, archivos: 789, carpetas: 3 },
    { nombre: "Diegomineiro_xl", bytes: 179695357978, archivos: 419, carpetas: 4 },
    { nombre: "BELIAL", bytes: 164798538550, archivos: 672, carpetas: 6 },
  ],
};

export const LIBERAR_REAL: QueLiberar = {
  copias: { bytes: 6806501617387, grupos: 73727, copias_de_mas: 89658 },
  papelera: { bytes: 4485234183241, archivos: 160375 },
  carpetas_tiradas: [
    { id: "t1", nombre: "Alicia Trece", padre: "KASH-CONTENT-VPS", tirada: "2026-10-05T15:00:00Z", por: "Monica Duque", bytes: 1551000000000, archivos: 4401 },
    { id: "t2", nombre: "LUSH 3.0", padre: "KASH", tirada: "2026-10-05T15:00:00Z", por: "Monica Duque", bytes: 1427000000000, archivos: 47655 },
    { id: "t3", nombre: "DRIVE CONTENT GENERAL", padre: "KASH", tirada: "2026-10-05T15:00:00Z", por: "Monica Duque", bytes: 1252000000000, archivos: 95912 },
  ],
  top: [
    { nombre: "c6602.mp4", size: 47815843039, copias: 2, recupera: 47815843039, unidades: ["Contenido Shootings"] },
    { nombre: "c6405.mp4", size: 40970667053, copias: 2, recupera: 40970667053, unidades: ["Contenido Shootings"] },
    { nombre: "c8143.mp4", size: 36373998884, copias: 2, recupera: 36373998884, unidades: ["AI Content Services", "PROYECTO MEDELLIN"] },
    { nombre: "c4678.mp4", size: 34799083826, copias: 2, recupera: 34799083826, unidades: ["COPIA DE SEGURIDAD SHOOTING MARZO 2024", "VIRAL + PODCAST"] },
    { nombre: "copia de copia de alex, eli, aa - full video.mp4", size: 15018604430, copias: 3, recupera: 30037208860, unidades: [""] },
  ],
};
