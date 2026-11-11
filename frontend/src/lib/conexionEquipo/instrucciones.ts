import type { TranslationKey } from "@/lib/i18n";
import { EVENTOS_EQUIPO, TEXTO_EVENTO } from "./webhook";

// El texto que el dueño copia y le pasa a quien maneja su plataforma (paso 2 de
// Conectar tu plataforma). La prosa sale del diccionario (se copia en el idioma de
// la pantalla); el cuerpo de ejemplo y el curl son código, iguales en los dos
// idiomas: los nombres de los campos son los del API.
//
// La llave NUNCA va en el texto: solo el nombre de la variable de entorno.

/** El cuerpo de POST /equipo/sync, con todos los campos. */
export const EJEMPLO_SYNC = `{
  "ensayo": true,
  "roles": ["Chatter", "Supervisor"],
  "personas": [
    {
      "correo": "ana.torres@tuagencia.com",
      "nombre": "Ana Torres",
      "activo": true,
      "rol": "Chatter",
      "nivel": "agente",
      "equipo": "Turno A",
      "reporta_a": "jefe@tuagencia.com",
      "hora_entrada": "08:00",
      "hora_salida": "16:00"
    },
    { "correo": "sale@tuagencia.com", "nombre": "Luis Gil", "activo": false }
  ]
}`;

export function ejemploCurl(base: string): string {
  return `curl -X POST "${base}/equipo/sync" \\
  -H "Authorization: Bearer $MAVEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @equipo.json`;
}

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function armarInstrucciones(t: T, base: string): string {
  return [
    t("conexionEquipo.instr.titulo"),
    "",
    t("conexionEquipo.instr.base", { base }),
    t("conexionEquipo.instr.auth"),
    t("conexionEquipo.instr.secreto"),
    "",
    t("conexionEquipo.instr.sync.titulo"),
    t("conexionEquipo.instr.sync.cuando"),
    "```json",
    EJEMPLO_SYNC,
    "```",
    t("conexionEquipo.instr.sync.reglas"),
    t("conexionEquipo.instr.sync.respuesta"),
    "",
    t("conexionEquipo.instr.leer.titulo"),
    `- ${t("conexionEquipo.instr.leer.equipo")}`,
    `- ${t("conexionEquipo.instr.leer.horas")}`,
    `- ${t("conexionEquipo.instr.leer.notas")}`,
    "",
    t("conexionEquipo.instr.avisos.titulo"),
    t("conexionEquipo.instr.avisos.cuerpo"),
    ...EVENTOS_EQUIPO.map((e) => `- \`${e}\`: ${t(TEXTO_EVENTO[e])}`),
    "",
    t("conexionEquipo.instr.ejemplo.titulo"),
    "```bash",
    ejemploCurl(base),
    "```",
  ].join("\n");
}
