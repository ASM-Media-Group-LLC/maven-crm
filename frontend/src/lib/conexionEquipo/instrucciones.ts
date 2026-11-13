import type { TranslationKey } from "@/lib/i18n";
import { EVENTOS_EQUIPO, EVENTO_PRUEBA, TEXTO_EVENTO } from "./webhook";

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
      "hora_salida": "16:00",
      "horario_semana": {
        "lun": ["08:00", "16:00"], "mar": ["08:00", "16:00"], "mie": ["08:00", "16:00"],
        "jue": ["08:00", "16:00"], "vie": ["08:00", "16:00"], "sab": null, "dom": null
      }
    },
    { "correo": "sale@tuagencia.com", "nombre": "Luis Gil", "activo": false }
  ]
}`;

/** La respuesta de POST /equipo/sync (docs/conectar-plataforma.md §2), recortada. */
export const EJEMPLO_RESPUESTA = `{
  "object": "equipo_sync",
  "ensayo": false,
  "aplicar_activado": true,
  "sync_id": "6f1c…",
  "recibidas": 2,
  "cambios": [
    { "user_id": "a1…", "correo": "ana.torres@tuagencia.com", "nombre": "Ana Torres", "campo": "rol",
      "antes": "Chatter", "despues": "Supervisor", "aplicado": true, "se_aplicaria": true }
  ],
  "pendientes_de_crear": [
    { "correo": "nueva@tuagencia.com", "nombre": "Nueva Persona", "rol": "Chatter", "nivel": "agente",
      "equipo": "Turno A", "reporta_a": "jefe@tuagencia.com" }
  ],
  "roles_desconocidos": [],
  "protegidos": [],
  "no_vienen_en_backstage": [],
  "en_papelera": [],
  "rechazados": [],
  "freno_de_bajas": null,
  "roles": {
    "ensayo": false,
    "creados": ["Supervisor"],
    "ya_estaban": ["Chatter"],
    "rechazados": [{ "nombre": "Admin", "motivo": "rol_de_admin" }]
  },
  "pendientes": { "ensayo": false, "registradas": 1, "actualizadas": 0, "ignoradas": [] }
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
    "",
    t("conexionEquipo.instr.sync.respuesta"),
    "```json",
    EJEMPLO_RESPUESTA,
    "```",
    t("conexionEquipo.instr.sync.respuestaNotas"),
    "",
    t("conexionEquipo.instr.leer.titulo"),
    t("conexionEquipo.instr.leer.rango"),
    `- ${t("conexionEquipo.instr.leer.equipo")}`,
    `- ${t("conexionEquipo.instr.leer.horas")}`,
    `- ${t("conexionEquipo.instr.leer.notas")}`,
    `- ${t("conexionEquipo.instr.leer.argos")}`,
    "",
    t("conexionEquipo.instr.avisos.titulo"),
    t("conexionEquipo.instr.avisos.cuerpo"),
    ...[...EVENTOS_EQUIPO, EVENTO_PRUEBA].map((e) => `- \`${e}\`: ${t(TEXTO_EVENTO[e])}`),
    t("conexionEquipo.instr.avisos.reglas"),
    "",
    t("conexionEquipo.instr.ejemplo.titulo"),
    "```bash",
    ejemploCurl(base),
    "```",
  ].join("\n");
}
