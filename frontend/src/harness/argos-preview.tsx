// Banco visual local. No se importa desde App.tsx y no usa sesión, base ni capturas reales.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/hooks/useLanguage";
import { cargarIdioma, fijarIdioma } from "@/lib/i18n";
import { PresenciaArgosVista } from "@/components/hr/DondeEstaPanel";
import {
  CardMuralla,
  CeldaCuadricula,
} from "@/components/hr/PantallazosVivoPanel";
import type { FilaDondeEsta } from "@/hooks/useDondeEsta";
import type { PersonaVivo } from "@/hooks/useCapturasVivo";
import type { Semaforo } from "@/hooks/useSemaforos";
import { corteEjemplo, horariosEjemplo, RelevoArgos } from "./argos-relevo";
import { CalendarioArgos } from "./argos-calendario";
import { CierreDiaArgos } from "./argos-cierre-dia";
import { diaBogota } from "@/lib/historialHub";
import { fechaDeDia } from "@/lib/casosArgos";
import { capturaDeEjemplo } from "./argos-capturas-ejemplo";
import {
  Activity,
  Bell,
  CircleCheck,
  Clock3,
  Utensils,
  BookOpen,
  CalendarClock,
  CameraOff,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  LayoutDashboard,
  LayoutGrid,
  Grid3x3,
  MonitorPlay,
  List,
  Mail,
  MessageCircle,
  Monitor,
  PanelTop,
  Radio,
  Search,
  Settings,
  Users,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import "@/index.css";

const diaAlAbrir = new Date();
const HOY = diaBogota(diaAlAbrir);
const AYER = diaBogota(diaAlAbrir, 1);
const fechaCorta = (dia: string) =>
  fechaDeDia(dia).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
const personas = [
  {
    id: "laura",
    nombre: "Laura Méndez",
    iniciales: "LM",
    equipo: "Operaciones",
    puesto: "Supervisor",
    turno: "AM",
    estado: "En Cowork",
    ubicacion: "Cowork · Sala Operaciones",
    pantalla: "Sí",
    camara: "No",
    conexion: "Conectada",
    observacion: {
      app: "Cowork",
      actividad: "Tablero de salas abierto",
      hora: "16:20",
    },
  },
  {
    id: "diego",
    nombre: "Diego Torres",
    iniciales: "DT",
    equipo: "Operaciones",
    puesto: "Consultor",
    turno: "AM",
    estado: "Fuera de turno",
    pantalla: "—",
    camara: "—",
    conexion: "Terminó su sesión",
    observacion: {
      app: "Meet",
      actividad: "Agenda de la reunión en pantalla",
      hora: "15:48",
    },
  },
  {
    id: "camila",
    nombre: "Camila Ríos",
    iniciales: "CR",
    equipo: "RR. HH.",
    puesto: "Recursos humanos",
    turno: "AM",
    estado: "Fuera de turno",
    pantalla: "—",
    camara: "—",
    conexion: "Terminó su sesión",
    observacion: {
      app: "Horarios",
      actividad: "Turnos del equipo en pantalla",
      hora: "15:54",
    },
  },
  {
    id: "mateo",
    nombre: "Mateo Díaz",
    iniciales: "MD",
    equipo: "Operaciones",
    puesto: "Supervisor",
    turno: "PM",
    estado: "Sin entrada registrada",
    pantalla: "—",
    camara: "—",
    conexion: "Sin señal de conexión",
    observacion: null,
  },
  {
    id: "lucia",
    nombre: "Lucía Paz",
    iniciales: "LP",
    equipo: "Operaciones",
    puesto: "Asistente",
    turno: "PM",
    estado: "En reunión",
    ubicacion: "Meet · Revisión de entregas",
    pantalla: "Sí",
    camara: "Sí",
    conexion: "Conectada",
    observacion: {
      app: "Documentos",
      actividad: "Lista de entregas abierta",
      hora: "16:18",
    },
  },
  {
    id: "ines",
    nombre: "Inés Vega",
    iniciales: "IV",
    equipo: "Operaciones",
    puesto: "Asistente",
    turno: "PM",
    estado: "Fuera de turno",
    pantalla: "—",
    camara: "—",
    conexion: "Sin señal de conexión",
    observacion: null,
  },
  {
    id: "nora",
    nombre: "Nora León",
    iniciales: "NL",
    equipo: "Operaciones",
    puesto: "Consultor",
    turno: "PM",
    estado: "Fuera de turno",
    pantalla: "—",
    camara: "—",
    conexion: "Sin señal de conexión",
    observacion: null,
  },
].map((persona) => ({
  ...persona,
  entrada: horariosEjemplo[persona.id].marca ?? "—",
}));
type Persona = (typeof personas)[number];
type Tipo = "Hub" | "Actividad" | "Jornada" | "Conexión";
type Decision = "Confirmada" | "Justificada" | "Descartada";
type Pausa = { inicio: string; regreso: string | null; limite: number };
type TipoAviso = "Cámara" | "Pantalla" | "Actividad" | "Jornada";
type Episodio = {
  id: string;
  persona: string;
  fecha: string;
  hora: string;
  tipo: Tipo;
  titulo: string;
  duracion: string;
  causa: string;
  evidencia: string;
  regla: string;
  revisar?: boolean;
  responsable?: string;
  llamadaConfirmada?: { por: string; hora: string; motivo: string };
  captura?: { hora: string; url: string };
  tipoAviso?: TipoAviso;
  recuperado?: string;
  pausa?: Pausa;
  accion?: string;
  movimientos: [hora: string, detalle: string, aviso?: boolean][];
};
function minutosDePausa(pausa: Pausa): number | null {
  if (!pausa.regreso) return null;
  const enMinutos = (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  };
  const inicio = enMinutos(pausa.inicio);
  const regreso = enMinutos(pausa.regreso);
  return (regreso - inicio + 1440) % 1440;
}

function textoHora(hora: string) {
  const [h, m] = hora.split(":");
  return `${Number(h) % 12 || 12}:${m} ${Number(h) < 12 ? "a. m." : "p. m."}`;
}

const almuerzoLaura: Pausa = { inicio: "12:30", regreso: "13:12", limite: 30 };
const almuerzoDiego: Pausa = { inicio: "12:10", regreso: null, limite: 45 };
const almuerzoCamila: Pausa = { inicio: "12:30", regreso: "13:00", limite: 30 };

const episodios: Episodio[] = [
  {
    id: "1",
    persona: "laura",
    fecha: HOY,
    hora: "16:12",
    tipo: "Hub",
    tipoAviso: "Cámara",
    titulo: "Cámara apagada",
    duracion: "8 min · abierto",
    causa: "Causa sin determinar",
    evidencia:
      "El Hub registró la cámara apagada a las 4:12 p. m. Seguía apagada en el último registro, a las 4:20 p. m.",
    regla:
      "Supervisión requiere cámara durante el turno. En este ejemplo, se revisa si sigue apagada después de 5 min.",
    accion:
      "Verificar si la cámara se recuperó y si hubo una causa técnica o una pausa autorizada.",
    revisar: true,
    movimientos: [
      ["16:12", "El Hub registró la cámara apagada."],
      ["16:13", "Argos pidió encender la cámara.", true],
      ["16:15", "Argos repitió el aviso.", true],
      ["16:17", "El episodio pasó a revisión."],
      ["16:18", "Argos volvió a avisar.", true],
      ["16:20", "Última señal: cámara apagada."],
    ],
  },
  {
    id: "7",
    persona: "laura",
    fecha: HOY,
    hora: "10:12",
    tipo: "Hub",
    tipoAviso: "Cámara",
    titulo: "Cámara recuperada",
    duracion: "4 min",
    causa: "Causa sin determinar",
    recuperado: "10:16",
    evidencia:
      "El Hub registró la cámara apagada y luego encendida. No registró qué causó el apagado.",
    regla:
      "Supervisión requiere cámara durante el turno. La cámara volvió antes de superar el umbral de este ejemplo.",
    accion: "Consultar si el episodio se repite.",
    movimientos: [
      ["10:12", "El Hub registró la cámara apagada."],
      ["10:13", "Argos pidió encender la cámara.", true],
      ["10:15", "Argos repitió el aviso.", true],
      ["10:16", "El Hub registró la cámara encendida."],
    ],
  },
  {
    id: "8",
    responsable: "Sofía Ruiz",
    persona: "laura",
    fecha: HOY,
    hora: almuerzoLaura.inicio,
    tipo: "Jornada",
    titulo: "Almuerzo",
    duracion: `${minutosDePausa(almuerzoLaura)} min`,
    causa: "Pausa registrada",
    pausa: almuerzoLaura,
    evidencia: "Maven registró inicio y regreso de la pausa de comida.",
    regla: "La posición permite 30 minutos de almuerzo en este ejemplo.",
    accion: "Comprobar si los minutos adicionales estaban autorizados.",
    revisar: true,
    movimientos: [
      ["12:30", "Marcó inicio de almuerzo."],
      ["13:12", "Marcó regreso del almuerzo."],
    ],
  },
  {
    id: "9",
    persona: "diego",
    fecha: HOY,
    hora: almuerzoDiego.inicio,
    tipo: "Jornada",
    titulo: "Almuerzo",
    duracion: "Regreso sin confirmar",
    causa: "Registro incompleto",
    pausa: almuerzoDiego,
    evidencia:
      "Maven registró el inicio de la pausa. Falta confirmar el regreso.",
    regla: "La posición permite 45 minutos de almuerzo en este ejemplo.",
    accion: "Verificar el regreso antes de calcular el tiempo consumido.",
    movimientos: [["12:10", "Marcó inicio de almuerzo."]],
  },
  {
    id: "2",
    persona: "diego",
    fecha: HOY,
    hora: "10:08",
    tipo: "Conexión",
    titulo: "Pantalla compartida interrumpida",
    recuperado: "10:08:42",
    duracion: "42 s · recuperada",
    causa: "Corte de conexión registrado",
    evidencia:
      "Meet perdió la conexión a las 10:08. Se restablecieron la conexión y la pantalla en 42 segundos.",
    regla:
      "Se consulta en Salud de la plataforma. El historial de la persona conserva el episodio.",
    movimientos: [
      ["10:08:00", "La conexión de Meet se interrumpió."],
      ["10:08:42", "Se recuperó la conexión y volvió la pantalla compartida."],
    ],
  },
  {
    id: "3",
    persona: "camila",
    fecha: HOY,
    hora: "09:46",
    tipo: "Actividad",
    titulo: "Actividad en una aplicación por verificar",
    captura: {
      hora: "09:46",
      url: capturaDeEjemplo("Navegador / Consulta externa", [
        "Página de referencia",
        "Material de consulta",
        "Recursos relacionados",
        "Índice del sitio",
      ]),
    },
    tipoAviso: "Actividad",
    accion: "Consultar el contexto de esa tarea con RR. HH.",
    duracion: "6 min",
    causa: "Observación de Argos",
    evidencia:
      "Argos marcó dos revisiones de pantalla. La actividad requiere contexto del puesto para confirmar si correspondía al trabajo.",
    regla:
      "RR. HH. · validar la actividad respecto a las herramientas autorizadas para su posición.",
    revisar: true,
    movimientos: [
      ["09:46", "Primera observación de Argos."],
      ["09:49", "Argos pidió revisar la actividad abierta.", true],
      ["09:52", "Terminó el intervalo observado."],
    ],
  },
  {
    id: "10",
    persona: "diego",
    fecha: HOY,
    hora: "11:00",
    tipo: "Jornada",
    titulo: "Relevo sin registrar",
    duracion: "15 min",
    causa: "Revisión de supervisión",
    evidencia:
      "La supervisora verificó con Diego que faltaba la nota prevista a las 11:00. El registro se completó a las 11:15.",
    regla:
      "La posición de este ejemplo debe dejar la nota del relevo al terminar la reunión.",
    llamadaConfirmada: {
      por: "Sofía Ruiz",
      hora: "11:20",
      motivo: "Faltó registrar la nota de relevo al cierre de la reunión.",
    },
    movimientos: [
      ["11:00", "Hora prevista para registrar el relevo."],
      ["11:15", "Se completó la nota de relevo."],
      [
        "11:20",
        "Sofía Ruiz confirmó una llamada de atención y dejó su motivo.",
      ],
    ],
  },
  {
    id: "4",
    persona: "laura",
    fecha: HOY,
    hora: "09:02",
    tipo: "Hub",
    titulo: "Comenzó a compartir pantalla",
    duracion: "Movimiento",
    causa: "Inicio registrado",
    evidencia: "Maven confirmó el inicio de la pantalla compartida.",
    regla: "Movimiento conservado en el historial del Hub.",
    movimientos: [["09:02", "Se inició la pantalla compartida."]],
  },
  {
    id: "relevo-ayer",
    persona: "diego",
    fecha: AYER,
    hora: "15:40",
    titulo: "Nota de relevo por confirmar",
    tipo: "Jornada",
    duracion: "Al cierre del turno",
    causa: "Pendiente de revisión",
    evidencia:
      "A las 16:00 seguía pendiente la confirmación de la nota de relevo en el registro de ejemplo.",
    regla: "El turno de Operaciones entrega su nota antes del relevo.",
    accion:
      "Comprobar con la persona responsable si la nota quedó en otro canal.",
    revisar: true,
    movimientos: [
      ["15:40", "Se abrió la revisión de la nota de relevo."],
      ["16:00", "El turno cerró con la confirmación pendiente."],
    ],
  },
  {
    id: "5",
    persona: "camila",
    fecha: AYER,
    hora: "12:30",
    tipo: "Jornada",
    titulo: "Almuerzo",
    pausa: almuerzoCamila,
    duracion: "30 min",
    causa: "Pausa autorizada",
    evidencia: "La jornada registra el inicio y el fin de la pausa.",
    regla: "Pausa de 30 minutos configurada para su posición.",
    movimientos: [
      ["12:30", "Comenzó la pausa."],
      ["13:00", "Volvió de la pausa."],
    ],
  },
  {
    id: "6",
    persona: "laura",
    fecha: AYER,
    hora: "10:02",
    tipo: "Hub",
    titulo: "Cámara apagada y recuperada",
    recuperado: "10:03",
    duracion: "1 min",
    causa: "Causa sin determinar",
    evidencia: "Se registraron ambos cambios de cámara durante el turno.",
    regla:
      "El episodio quedó por debajo de la duración configurada para revisión.",
    movimientos: [
      ["10:02", "El Hub registró la cámara apagada."],
      ["10:03", "El Hub registró la cámara encendida."],
    ],
  },
];

const tabs = [
  { nombre: "Resumen", icono: LayoutDashboard },
  { nombre: "En vivo", icono: Radio },
  { nombre: "Estado", icono: Activity },
  { nombre: "Historial", icono: BookOpen },
  { nombre: "Revisión", icono: ClipboardCheck },
] as const;
type Pestaña = (typeof tabs)[number]["nombre"] | "Ajustes";
type Filtros = {
  fecha: string;
  equipo: string;
  turno: string;
  persona: string;
};
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const porId = (id: string) => personas.find((persona) => persona.id === id)!;
const avisosDe = (episodio: Episodio) =>
  episodio.movimientos.filter((movimiento) => movimiento[2]);
const iconoDe = {
  Hub: CameraOff,
  Actividad: Monitor,
  Jornada: CalendarClock,
  Conexión: WifiOff,
};

function Identidad({ persona }: { persona: Persona }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-9 w-9">
        <AvatarFallback className="bg-primary/15 text-primary">
          {persona.iniciales}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-semibold">{persona.nombre}</p>
        <p className="truncate text-xs text-muted-foreground">
          {persona.puesto} · {persona.equipo}
        </p>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="vidrio rounded-2xl p-4 sm:p-5">
      <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

const isoEnBogota = (hora: string) => `${HOY}T${hora}:00-05:00`;
const horaCaptura = isoEnBogota(corteEjemplo);
const ahoraEjemplo = Date.parse(horaCaptura);
const pantallas = new Map([
  [
    "laura",
    capturaDeEjemplo("Cowork / Salas", [
      "Operaciones",
      "Reunión de equipo",
      "Soporte",
      "Coordinación",
    ]),
  ],
  [
    "diego",
    capturaDeEjemplo("Meet / Agenda", [
      "Revisión semanal",
      "Compartiendo pantalla",
      "Propuesta de operaciones",
      "Próxima reunión",
    ]),
  ],
  [
    "camila",
    capturaDeEjemplo("Oficina / Horarios", [
      "Turnos de hoy",
      "Cambios pendientes",
      "Agenda del equipo",
      "Pausas del turno",
    ]),
  ],
  [
    "lucia",
    capturaDeEjemplo("Oficina / Documentos", [
      "Lista de entregas",
      "Pendiente de revisión",
      "Entrega del viernes",
      "Material recibido",
    ]),
  ],
]);
const capturas = new Map<string, PersonaVivo>();
const ultimas: Record<
  string,
  { pantallaUrl: string; camaraUrl: null; ultima: string }
> = {};
for (const persona of personas) {
  const pantalla = pantallas.get(persona.id);
  const obs = persona.observacion;
  if (!pantalla || !obs) continue;
  const ultima = isoEnBogota(obs.hora);
  if (persona.estado === "Fuera de turno") {
    ultimas[persona.id] = { pantallaUrl: pantalla, camaraUrl: null, ultima };
    continue;
  }
  capturas.set(persona.id, {
    userId: persona.id,
    nombre: persona.nombre,
    avatarUrl: null,
    avatarSeed: null,
    pantallaUrl: pantalla,
    principalUrl: pantalla,
    camaraUrl: null,
    ultima,
    tienePantalla: true,
    fueraDeLugar: null,
    veredicto: `${obs.app} · ${obs.actividad}`,
  });
}

function presenciaDe(
  persona: Persona,
): FilaDondeEsta & { presenciaEnSala: boolean } {
  const fuera = persona.estado === "Fuera de turno";
  const sinMarca = persona.estado === "Sin entrada registrada";
  const obs = persona.observacion;
  const horario = horariosEjemplo[persona.id];
  const inicioEstado = persona.camara === "No" ? "16:12" : horario.marca;
  return {
    user_id: persona.id,
    presenciaEnSala:
      persona.conexion === "Conectada" && persona.estado === "En Cowork",
    nombre: persona.nombre,
    puesto: persona.puesto,
    equipo: persona.equipo,
    entrada: horario.inicio,
    salida: horario.fin,
    en_turno: !fuera,
    estado: fuera
      ? "fuera_de_turno"
      : sinMarca
        ? "no_ha_entrado"
        : persona.camara === "No"
          ? "sin_camara"
          : persona.estado === "En reunión"
            ? "meet"
            : "activo",
    estado_desde: fuera || !inicioEstado ? null : isoEnBogota(inicioEstado),
    ultimo_latido: persona.conexion === "Conectada" ? horaCaptura : null,
    pantalla_at: obs ? isoEnBogota(obs.hora) : null,
    pantalla_que: obs ? `${obs.app} · ${obs.actividad}` : null,
    pantalla_fuera_de_lugar: null,
    captura_at: obs ? isoEnBogota(obs.hora) : null,
    fuera_hoy_veces: 0,
    fuera_hoy_min: 0,
    exento: false,
  };
}

function PantallaEjemplo({ persona }: { persona: Persona }) {
  const url = pantallas.get(persona.id);
  return url ? (
    <img
      className="w-full rounded-xl border border-border/60"
      src={url}
      alt={`Pantalla de ejemplo de ${persona.nombre}`}
    />
  ) : null;
}

function InformeTurno({
  persona,
  dia,
  movimientos,
  decisiones,
  abrirEpisodio,
}: {
  persona: Persona;
  dia: string;
  movimientos: Episodio[];
  decisiones: Record<string, { resultado: Decision; motivo: string }>;
  abrirEpisodio: (item: Episodio) => void;
}) {
  const almuerzo = movimientos.find((item) => item.pausa);
  const pausa = almuerzo?.pausa;
  const minutos = pausa ? minutosDePausa(pausa) : null;
  const diferencia = pausa && minutos !== null ? minutos - pausa.limite : null;
  const corregidos = movimientos.filter((item) => item.recuperado);
  const pendientes = movimientos.filter(
    (item) => item.revisar && !decisiones[item.id],
  );
  const revisados = movimientos.filter((item) => decisiones[item.id]);
  const grupos = (["Cámara", "Pantalla", "Actividad", "Jornada"] as const)
    .map((tipo) => {
      const avisados = movimientos.filter(
        (item) => item.tipoAviso === tipo && avisosDe(item).length > 0,
      );
      return {
        tipo,
        avisados,
        total: avisados.reduce(
          (total, item) => total + avisosDe(item).length,
          0,
        ),
      };
    })
    .filter(({ total }) => total > 0);

  function acceso(item: Episodio, texto: string) {
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => abrirEpisodio(item)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{item.titulo}</span>
          <span className="block text-xs text-muted-foreground">{texto}</span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
    );
  }

  return (
    <section aria-label="Informe del turno" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="text-base font-semibold">Informe del turno</h2>
        <span className="text-xs text-muted-foreground">
          {fechaCorta(dia)} · turno {persona.turno}
        </span>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Clock3 className="h-4 w-4 text-primary" />
          Jornada y pausas
        </h3>
        {dia === HOY && (
          <p className="text-xs text-muted-foreground">
            Entrada ·{" "}
            {persona.entrada === "—"
              ? "Sin registro"
              : textoHora(persona.entrada)}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium">
            <Utensils className="h-3.5 w-3.5" />
            Almuerzo
          </span>
          {diferencia !== null && (
            <Badge variant={diferencia > 0 ? "warning-soft" : "success-soft"}>
              {diferencia > 0
                ? `${diferencia} min de más`
                : "Dentro del límite"}
            </Badge>
          )}
        </div>
        {pausa && almuerzo ? (
          <button
            type="button"
            onClick={() => abrirEpisodio(almuerzo)}
            className="block w-full rounded-lg text-left hover:bg-muted/50"
            aria-label="Ver detalle del almuerzo"
          >
            <span className="block text-xs text-muted-foreground">
              {textoHora(pausa.inicio)} ·{" "}
              {pausa.regreso
                ? `Regreso ${textoHora(pausa.regreso)}`
                : "Regreso sin confirmar"}
            </span>
            {minutos !== null ? (
              <>
                <span className="mt-1 block font-semibold tabular-nums">
                  {minutos} min registrados{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    / {pausa.limite} min permitidos
                  </span>
                </span>
                <span
                  className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <span
                    className="bg-primary"
                    style={{
                      width: `${(100 * Math.min(minutos, pausa.limite)) / Math.max(minutos, pausa.limite)}%`,
                    }}
                  />
                  {diferencia !== null && diferencia > 0 && (
                    <span className="flex-1 bg-warning" />
                  )}
                </span>
              </>
            ) : (
              <span className="mt-1 block text-xs text-muted-foreground">
                Límite: {pausa.limite} min · duración pendiente
              </span>
            )}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sin registro de almuerzo para este día.
          </p>
        )}
      </div>

      <details
        className="rounded-xl border border-border/60 bg-background/30 p-3"
        open={corregidos.length > 0}
      >
        <summary className="cursor-pointer font-semibold">
          <span className="ml-1 inline-flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-success" />
            Qué se corrigió{" "}
            <Badge variant="success-soft">{corregidos.length}</Badge>
          </span>
        </summary>
        {corregidos.length ? (
          <div className="mt-2 divide-y divide-border/50">
            {corregidos.map((item) =>
              acceso(
                item,
                `${item.duracion} · volvió ${textoHora(item.recuperado!)}`,
              ),
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Sin recuperaciones registradas.
          </p>
        )}
      </details>

      <details
        className="rounded-xl border border-border/60 bg-background/30 p-3"
        open={pendientes.length > 0}
      >
        <summary className="cursor-pointer font-semibold">
          <span className="ml-1 inline-flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-warning" />
            Qué requiere revisión{" "}
            <Badge variant="warning-soft">{pendientes.length}</Badge>
          </span>
        </summary>
        {pendientes.length ? (
          <div className="mt-2 divide-y divide-border/50">
            {pendientes.map((item) =>
              acceso(item, `${textoHora(item.hora)} · ${item.duracion}`),
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Sin incidencias pendientes.
          </p>
        )}
        {revisados.length > 0 && (
          <div className="mt-2 border-t border-border/50 pt-2">
            <p className="text-xs text-muted-foreground">
              Decisiones de RR. HH.
            </p>
            {revisados.map((item) =>
              acceso(item, decisiones[item.id].resultado),
            )}
          </div>
        )}
      </details>

      <details className="rounded-xl border border-border/60 bg-background/30 p-3">
        <summary className="cursor-pointer font-semibold">
          <span className="ml-1 inline-flex flex-wrap items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Avisos de Argos
            {grupos.map(({ tipo, total }) => (
              <Badge key={tipo} variant="secondary-soft">
                {tipo} · {total}
              </Badge>
            ))}
          </span>
        </summary>
        {grupos.length ? (
          grupos.map(({ tipo, avisados }) => (
            <div key={tipo} className="mt-3">
              <h3 className="text-xs font-medium text-muted-foreground">
                {tipo}
              </h3>
              {avisados.map((item) =>
                acceso(
                  item,
                  `${textoHora(item.hora)} · ${avisosDe(item).length} avisos · ${item.recuperado ? "Recuperado" : item.duracion}`,
                ),
              )}
            </div>
          ))
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Sin avisos registrados.
          </p>
        )}
      </details>
    </section>
  );
}

function PreviewArgos() {
  const [tab, setTab] = useState<Pestaña>("Resumen");
  const [filtros, setFiltros] = useState<Filtros>({
    fecha: HOY,
    equipo: "",
    turno: "",
    persona: "",
  });
  const [vista, setVista] = useState("Muralla");
  const [refrescando, setRefrescando] = useState(false);
  const [historial, setHistorial] = useState("Jornada");
  const [estado, setEstado] = useState("Avisos");
  const [supervision, setSupervision] = useState("Pendientes");
  const [revision, setRevision] = useState("Pendientes");
  const [detalle, setDetalle] = useState<{
    persona: string;
    episodio?: string;
  }>();
  const [seccionDetalle, setSeccionDetalle] = useState("Cronología");
  const panelDetalle = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!detalle) return;
    panelDetalle.current?.focus({ preventScroll: true });
    if (panelDetalle.current) {
      const caja = panelDetalle.current.getBoundingClientRect();
      if (caja.top < 0 || caja.top >= window.innerHeight)
        panelDetalle.current.scrollIntoView({ block: "start" });
    }
  }, [detalle]);
  const [decisiones, setDecisiones] = useState<
    Record<string, { resultado: Decision; motivo: string }>
  >({});
  const [resultado, setResultado] = useState<Decision>("Confirmada");
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cambiar = (seccion: Pestaña) => {
    setTab(seccion);
    setDetalle(undefined);
    setMensaje("");
  };
  const equipoVisible = personas.filter(
    (persona) =>
      (!filtros.equipo || persona.equipo === filtros.equipo) &&
      (!filtros.turno || persona.turno === filtros.turno) &&
      (!filtros.persona ||
        persona.nombre
          .toLowerCase()
          .includes(filtros.persona.trim().toLowerCase())),
  );
  const diaSeleccionado = tab === "En vivo" ? HOY : filtros.fecha;
  const pendientesPorDia: Record<string, number> = {};
  for (const item of episodios) {
    if (
      item.revisar &&
      !decisiones[item.id] &&
      equipoVisible.some((p) => p.id === item.persona)
    ) {
      pendientesPorDia[item.fecha] = (pendientesPorDia[item.fecha] ?? 0) + 1;
    }
  }
  const delDia = episodios.filter(
    (episodio) =>
      episodio.fecha === diaSeleccionado &&
      equipoVisible.some(({ id }) => id === episodio.persona),
  );
  const pendientes = delDia.filter(
    (episodio) => episodio.revisar && !decisiones[episodio.id],
  );
  const tecnicos = delDia.filter(({ tipo }) => tipo === "Conexión");
  const conectados = equipoVisible.filter(
    (persona) => persona.conexion === "Conectada",
  );
  const porAtender = equipoVisible
    .map((persona) => ({
      persona,
      casos: pendientes.filter((item) => item.persona === persona.id),
    }))
    .filter(({ casos }) => casos.length);
  const conAvisos = equipoVisible
    .map((persona) => {
      const casos = delDia.filter(
        (item) => item.persona === persona.id && avisosDe(item).length,
      );
      return {
        persona,
        casos,
        total: casos.reduce((total, item) => total + avisosDe(item).length, 0),
      };
    })
    .filter(({ total }) => total > 0)
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.persona.nombre.localeCompare(b.persona.nombre, "es"),
    );

  const conLlamadas = equipoVisible
    .map((persona) => ({
      persona,
      casos: delDia.filter(
        (item) => item.persona === persona.id && item.llamadaConfirmada,
      ),
    }))
    .filter(({ casos }) => casos.length > 0)
    .sort(
      (a, b) =>
        b.casos.length - a.casos.length ||
        a.persona.nombre.localeCompare(b.persona.nombre, "es"),
    );

  function horaDeActividad(item: Episodio) {
    return decisiones[item.id]
      ? corteEjemplo
      : (item.movimientos[item.movimientos.length - 1]?.[0] ?? item.hora);
  }
  const recientes = delDia
    .filter((item) => !item.revisar || decisiones[item.id])
    .sort((a, b) => horaDeActividad(b).localeCompare(horaDeActividad(a)));

  const seleccion = detalle && porId(detalle.persona);
  const episodio = detalle?.episodio
    ? episodios.find(({ id }) => id === detalle.episodio)
    : undefined;

  const diaDelDetalle = episodio?.fecha ?? diaSeleccionado;
  const movimientosPersona = seleccion
    ? episodios
        .filter(
          (item) =>
            item.persona === seleccion.id && item.fecha === diaDelDetalle,
        )
        .sort((a, b) => b.hora.localeCompare(a.hora))
    : [];

  function abrirPersona(persona: Persona) {
    setDetalle({ persona: persona.id });
    setSeccionDetalle("Informe");
    setMensaje("");
  }

  function abrirEpisodio(item: Episodio) {
    setDetalle({ persona: item.persona, episodio: item.id });
    setSeccionDetalle("Cronología");
    setResultado(decisiones[item.id]?.resultado ?? "Confirmada");
    setMotivo(decisiones[item.id]?.motivo ?? "");
    setMensaje("");
  }

  function filaEpisodio(item: Episodio, reciente = false) {
    const Icono = iconoDe[item.tipo];
    const avisos = avisosDe(item).length;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => abrirEpisodio(item)}
        aria-pressed={detalle?.episodio === item.id}
        className="flex w-full flex-wrap items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted/60 aria-pressed:bg-primary/10 sm:flex-nowrap"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icono className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{item.titulo}</span>
          <span className="text-xs text-muted-foreground">
            {porId(item.persona).nombre} ·{" "}
            {reciente ? horaDeActividad(item) : item.hora} · {item.duracion}
            {avisos > 0
              ? ` · ${avisos} ${avisos === 1 ? "aviso" : "avisos"}`
              : ""}
          </span>
        </span>
        <Badge
          variant={
            item.revisar && !decisiones[item.id]
              ? "warning-soft"
              : "secondary-soft"
          }
        >
          {decisiones[item.id]?.resultado ??
            (item.revisar ? "Por revisar" : item.tipo)}
        </Badge>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  function lista(items: Episodio[], reciente = false) {
    return items.length ? (
      <div className="divide-y divide-border/50">
        {items.map((item) => filaEpisodio(item, reciente))}
      </div>
    ) : (
      <p className="py-4 text-sm text-muted-foreground">
        Sin movimientos con estos filtros.
      </p>
    );
  }

  function avisoCorto(item: Episodio) {
    const cantidad = avisosDe(item).length;
    const hecho = item.pausa
      ? "Almuerzo sobre el límite"
      : item.tipo === "Actividad"
        ? "Aplicación por revisar"
        : item.titulo;
    const minutos = item.pausa && minutosDePausa(item.pausa);
    const duracion =
      minutos != null && item.pausa
        ? `+${minutos - item.pausa.limite} min`
        : item.duracion.replace(" · abierto", "");
    const Icono = iconoDe[item.tipo];
    return (
      <button
        key={item.id}
        type="button"
        aria-label={`Ver episodio de ${porId(item.persona).nombre}: ${hecho}, ${duracion}, ${cantidad} ${cantidad === 1 ? "aviso" : "avisos"}`}
        onClick={() => abrirEpisodio(item)}
        className="flex w-full items-start gap-1.5 rounded-md py-1.5 text-left text-sm leading-snug hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icono
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
          aria-hidden
        />
        <span className="flex-1">
          {hecho} · {duracion} · {cantidad}{" "}
          {cantidad === 1 ? "aviso" : "avisos"}
        </span>
        <ChevronRight
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
    );
  }

  function detalleDeTarjeta(id: string) {
    const persona = porId(id);
    const obs = persona.observacion;
    const casos = pendientes.filter((item) => item.persona === id);
    return (
      <div className="space-y-1 border-t border-border/40 px-3 py-2.5 text-xs">
        {obs ? (
          <>
            <p className="leading-snug">
              <strong>{obs.app}</strong> · {obs.actividad}
            </p>
            <p className="text-muted-foreground">
              Última observación · {textoHora(obs.hora)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Sin actividad observada hoy</p>
        )}
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              persona.conexion === "Conectada"
                ? "bg-success"
                : "bg-muted-foreground/60",
            )}
            aria-hidden
          />
          Conexión · {persona.conexion}
        </p>
        {casos.length > 0 && (
          <div className="mt-1 border-t border-border/40 pt-1">
            {casos.map(avisoCorto)}
          </div>
        )}
      </div>
    );
  }

  function subnav(
    opciones: string[],
    vigente: string,
    elegir: (opcion: string) => void,
    conteos: Record<string, number> = {},
  ) {
    return (
      <div className="flex flex-wrap gap-2">
        {opciones.map((opcion) => (
          <Button
            key={opcion}
            size="sm"
            variant={vigente === opcion ? "secondary" : "ghost"}
            aria-pressed={vigente === opcion}
            onClick={() => elegir(opcion)}
          >
            {opcion}
            {conteos[opcion] !== undefined && (
              <span className="text-xs tabular-nums">{conteos[opcion]}</span>
            )}
          </Button>
        ))}
      </div>
    );
  }

  function fijarFiltro<K extends keyof Filtros>(clave: K, valor: Filtros[K]) {
    setFiltros((anterior) => ({ ...anterior, [clave]: valor }));
    setDetalle(undefined);
  }

  function exportarHoras() {
    const texto = [
      "Persona,Turno,Entrada",
      ...equipoVisible.map((p) => `${p.nombre},${p.turno},${p.entrada}`),
    ].join("\n");
    const enlace = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([texto], { type: "text/csv;charset=utf-8" }),
    );
    enlace.href = url;
    enlace.download = "argos-horas-ejemplo.csv";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  return (
    <div className="fondo-glass flex h-dvh w-full gap-2 overflow-hidden p-2">
      <aside
        className="vidrio-panel hidden w-[13.5rem] shrink-0 flex-col px-3 py-4 min-[800px]:flex"
        aria-label="Menú de Maven"
      >
        <div className="px-2 pb-5">
          <Logo size="sm" />
        </div>
        {(
          [
            ["Dashboard", LayoutDashboard],
            ["Argos", Eye],
            ["Cowork", Users],
            ["Messenger", MessageCircle],
            ["Correo", Mail],
            ["Meet", Video],
            ["Oficina", PanelTop],
          ] as const
        ).map(([nombre, Icono]) => (
          <div
            key={nombre}
            className={cn(
              "mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground",
              nombre === "Argos" && "bg-primary/20 font-semibold text-primary",
            )}
            aria-current={nombre === "Argos" ? "page" : undefined}
          >
            <Icono className="h-4 w-4" />
            {nombre}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-2 rounded-xl bg-card/70 p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>AM</AvatarFallback>
          </Avatar>
          <span className="text-sm">Vista del dueño</span>
        </div>
      </aside>
      <div className="vidrio-panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <Page>
          <PageHeader
            title="Argos"
            subtitle="Vista previa con datos de ejemplo"
            icon={<Eye />}
            actions={
              <>
                <Button
                  title="Horarios"
                  aria-label="Horarios"
                  variant="outline"
                  size="sm"
                  className="argos-accion-cabecera rounded-full"
                  onClick={() => {
                    cambiar("Historial");
                    setHistorial("Jornada");
                  }}
                >
                  <CalendarClock className="h-4 w-4" />
                  <span className="argos-texto-accion">Horarios</span>
                </Button>
                <Button
                  aria-label="Exportar horas"
                  variant="outline"
                  size="sm"
                  className="argos-accion-cabecera rounded-full"
                  onClick={exportarHoras}
                  disabled={diaSeleccionado !== HOY}
                  title={
                    diaSeleccionado !== HOY
                      ? "La muestra de marcaciones corresponde a hoy"
                      : undefined
                  }
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="argos-texto-accion">Exportar horas</span>
                </Button>
                <Button
                  title="Ajustes"
                  aria-label="Ajustes"
                  variant={tab === "Ajustes" ? "secondary" : "outline"}
                  size="sm"
                  className="argos-accion-cabecera rounded-full"
                  onClick={() => cambiar("Ajustes")}
                >
                  <Settings className="h-4 w-4" />
                  <span className="argos-texto-accion">Ajustes</span>
                </Button>
                <Badge
                  variant="outline"
                  className="gap-1.5 border-success/50 bg-success/10 px-3 py-1.5 text-success"
                >
                  <Eye className="h-3 w-3" />
                  Monitor activo
                </Badge>
              </>
            }
          />

          <nav
            aria-label="Secciones de Argos"
            className="my-4 flex gap-x-3 overflow-x-auto border-b border-border/60 sm:gap-x-6"
          >
            {tabs.map(({ nombre }) => (
              <button
                key={nombre}
                type="button"
                aria-current={tab === nombre ? "page" : undefined}
                onClick={() => cambiar(nombre)}
                className={cn(
                  "shrink-0 border-b-2 px-0.5 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                  tab === nombre
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {nombre}
              </button>
            ))}
          </nav>

          {tab !== "Ajustes" && tab !== "Resumen" && (
            <div className="my-4 grid grid-cols-2 gap-2 xl:grid-cols-[1fr_1fr_0.65fr_1.3fr]">
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Fecha
                <input
                  type="date"
                  className={selectClass}
                  disabled={tab === "En vivo"}
                  value={diaSeleccionado}
                  onChange={(e) => {
                    if (e.target.value) fijarFiltro("fecha", e.target.value);
                  }}
                />
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Equipo
                <select
                  className={selectClass}
                  value={filtros.equipo}
                  onChange={(e) => fijarFiltro("equipo", e.target.value)}
                >
                  <option value="">Todos</option>
                  <option>Operaciones</option>
                  <option>RR. HH.</option>
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Turno
                <select
                  className={selectClass}
                  value={filtros.turno}
                  onChange={(e) => fijarFiltro("turno", e.target.value)}
                >
                  <option value="">Todos</option>
                  <option>AM</option>
                  <option>PM</option>
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Persona
                <span className="relative block">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4" />
                  <Input
                    className="h-9 pl-9"
                    placeholder="Buscar nombre"
                    value={filtros.persona}
                    onChange={(e) => fijarFiltro("persona", e.target.value)}
                  />
                </span>
              </label>
            </div>
          )}

          <div
            className={cn(
              "grid items-start gap-4",
              detalle &&
                "min-[950px]:grid-cols-[minmax(0,1fr)_minmax(300px,43%)]",
            )}
          >
            <div className="min-w-0 space-y-4">
              {tab === "Resumen" && (
                <CalendarioArgos
                  fecha={filtros.fecha}
                  hoy={HOY}
                  pendientes={pendientesPorDia}
                  alCambiar={(dia) => fijarFiltro("fecha", dia)}
                />
              )}
              {tab === "Resumen" &&
                (filtros.equipo || filtros.persona || filtros.turno) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 text-sm">
                    <span>
                      {[filtros.equipo, filtros.turno, filtros.persona]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFiltros({
                          ...filtros,
                          equipo: "",
                          turno: "",
                          persona: "",
                        });
                        setDetalle(undefined);
                      }}
                    >
                      Quitar filtros
                    </Button>
                  </div>
                )}
              {tab === "Resumen" && filtros.fecha !== HOY && (
                <CierreDiaArgos
                  fecha={filtros.fecha}
                  hoy={HOY}
                  episodios={delDia}
                  decisiones={decisiones}
                  nombre={(id) => porId(id).nombre}
                  abrirEpisodio={abrirEpisodio}
                />
              )}
              {tab === "Resumen" && filtros.fecha === HOY && (
                <>
                  <RelevoArgos
                    personas={equipoVisible}
                    episodios={delDia}
                    decisiones={decisiones}
                    abrirPersona={(id) => abrirPersona(porId(id))}
                    abrirEpisodio={abrirEpisodio}
                  />
                  <section className="pt-4" aria-label="Equipo de hoy">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl font-semibold">
                          Equipo de hoy
                        </h2>
                      </div>
                      {subnav(
                        ["Pendientes", "Más avisos", "Conectados"],
                        supervision,
                        setSupervision,
                        { Conectados: conectados.length },
                      )}
                    </div>
                    {supervision === "Pendientes" ? (
                      <>
                        <div className="mt-3 grid gap-x-6 gap-y-2 border-y border-border/60 py-2 sm:grid-cols-2">
                          {porAtender.map(({ persona, casos }) => (
                            <div key={persona.id} className="py-2">
                              <button
                                type="button"
                                className="mb-1 text-base font-semibold hover:underline"
                                onClick={() => abrirPersona(persona)}
                              >
                                {persona.nombre}
                              </button>
                              {casos.map(avisoCorto)}
                            </div>
                          ))}
                          {!porAtender.length && (
                            <p className="text-sm text-muted-foreground">
                              Sin pendientes de revisión.
                            </p>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              fijarFiltro("fecha", HOY);
                              cambiar("Revisión");
                              setRevision("Pendientes");
                            }}
                          >
                            {pendientes.length} por revisar{" "}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              fijarFiltro("fecha", HOY);
                              cambiar("Estado");
                              setEstado("Salud de la plataforma");
                            }}
                          >
                            <WifiOff className="h-3.5 w-3.5" />{" "}
                            {tecnicos.length}{" "}
                            {tecnicos.length === 1
                              ? "incidencia técnica"
                              : "incidencias técnicas"}
                          </Button>
                        </div>
                      </>
                    ) : supervision === "Más avisos" ? (
                      <>
                        <h3 className="mt-3 mb-2 text-sm font-semibold">
                          Avisos de Argos
                        </h3>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Avisos automáticos emitidos hoy, agrupados por
                          episodio.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {conAvisos.map(({ persona, casos, total }) => (
                            <div
                              key={persona.id}
                              className="rounded-xl border border-border/60 bg-background/30 px-3 py-2"
                            >
                              <button
                                type="button"
                                className="flex w-full flex-wrap items-center justify-between gap-1 text-left text-sm hover:underline"
                                onClick={() => abrirPersona(persona)}
                              >
                                <strong>{persona.nombre}</strong>
                                <span className="text-xs tabular-nums">
                                  {total} {total === 1 ? "aviso" : "avisos"} ·{" "}
                                  {casos.length}{" "}
                                  {casos.length === 1
                                    ? "episodio"
                                    : "episodios"}
                                </span>
                              </button>
                              <details className="mt-1 text-xs">
                                <summary className="cursor-pointer text-muted-foreground">
                                  Ver episodios
                                </summary>
                                {casos.map(avisoCorto)}
                              </details>
                            </div>
                          ))}
                          {!conAvisos.length && (
                            <p className="text-sm text-muted-foreground">
                              Sin avisos emitidos hoy.
                            </p>
                          )}
                        </div>
                        <h3 className="mt-4 mb-1 border-t border-border/50 pt-3 text-sm font-semibold">
                          Llamadas de atención confirmadas
                        </h3>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Solo cuenta una llamada registrada expresamente por un
                          responsable.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {conLlamadas.map(({ persona, casos }) => (
                            <div
                              key={persona.id}
                              className="rounded-xl border border-border/60 bg-background/30 px-3 py-2"
                            >
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 text-left text-sm hover:underline"
                                onClick={() => abrirPersona(persona)}
                              >
                                <strong>{persona.nombre}</strong>
                                <span className="text-xs tabular-nums">
                                  {casos.length}{" "}
                                  {casos.length === 1
                                    ? "confirmada"
                                    : "confirmadas"}
                                </span>
                              </button>
                              {casos.map((item) => (
                                <button
                                  type="button"
                                  key={item.id}
                                  onClick={() => abrirEpisodio(item)}
                                  className="mt-1 block w-full rounded-md py-1 text-left text-xs hover:bg-muted/60"
                                  aria-label={`Ver llamada de atención de ${persona.nombre}: ${item.titulo}`}
                                >
                                  <span className="flex items-center gap-1.5 font-medium">
                                    {item.titulo}
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="block text-muted-foreground">
                                    {item.llamadaConfirmada!.por} ·{" "}
                                    {textoHora(item.llamadaConfirmada!.hora)}
                                  </span>
                                  <span className="block">
                                    {item.llamadaConfirmada!.motivo}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ))}
                          {!conLlamadas.length && (
                            <p className="text-xs text-muted-foreground">
                              Sin llamadas de atención confirmadas hoy.
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {conectados.map((persona) => (
                          <button
                            key={persona.id}
                            type="button"
                            onClick={() => abrirPersona(persona)}
                            className="rounded-xl border border-border/60 bg-background/30 px-3 py-2 text-left hover:bg-muted/60"
                          >
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-full bg-success"
                              />
                              {persona.nombre}
                              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                            <span className="mt-1 block text-sm">
                              {persona.ubicacion ?? "Ubicación sin confirmar"}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {persona.observacion
                                ? `${persona.observacion.app} · ${persona.observacion.actividad} · visto a las ${textoHora(persona.observacion.hora)}`
                                : "Sin actividad observada hoy"}
                            </span>
                          </button>
                        ))}
                        {!conectados.length && (
                          <p className="text-sm text-muted-foreground">
                            Sin conexiones activas en este equipo.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                  <PresenciaArgosVista
                    filas={equipoVisible.map(presenciaDe)}
                    ahora={ahoraEjemplo}
                    fotos={{}}
                    enVivo={capturas}
                    ultimas={ultimas}
                    accionesPersona={detalleDeTarjeta}
                    cargando={false}
                    fallo={false}
                    refrescando={refrescando}
                    alRefrescar={() => {
                      setRefrescando(true);
                      setTimeout(() => setRefrescando(false), 400);
                    }}
                    alAbrirPersona={(id) => abrirPersona(porId(id))}
                  />
                  <Grupo titulo="Actividad reciente">
                    {lista(recientes, true)}
                  </Grupo>
                </>
              )}

              {tab === "En vivo" && (
                <section className="vidrio sube p-4 lg:p-5">
                  <div className="v-cont">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
                        <MonitorPlay className="h-[18px] w-[18px]" />
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-display text-base font-bold tracking-tight">
                          Pantallazos en vivo
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Ahora · capturas de ejemplo
                        </p>
                      </div>
                      <div className="inline-flex flex-wrap gap-0.5 rounded-xl border border-border/50 bg-background/40 p-0.5">
                        {(
                          [
                            ["Muralla", LayoutGrid],
                            ["Cuadrícula", Grid3x3],
                            ["Lista", List],
                          ] as const
                        ).map(([nombre, Icono]) => (
                          <button
                            key={nombre}
                            type="button"
                            aria-pressed={vista === nombre}
                            onClick={() => setVista(nombre)}
                            className={cn(
                              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold",
                              vista === nombre
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <Icono className="h-4 w-4" />
                            {nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "grid gap-3",
                        vista === "Muralla" && "sm:grid-cols-2 lg:grid-cols-3",
                        vista === "Cuadrícula" &&
                          "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
                      )}
                    >
                      {equipoVisible.map((persona) => {
                        const captura = capturas.get(persona.id);
                        const sem: Semaforo =
                          persona.camara === "No" ? "naranja" : "verde";
                        const abrir = () => abrirPersona(persona);
                        if (vista === "Lista")
                          return (
                            <button
                              key={persona.id}
                              type="button"
                              onClick={abrir}
                              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2 text-left hover:bg-muted/60"
                            >
                              <Identidad persona={persona} />
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    captura
                                      ? "bg-success"
                                      : "bg-muted-foreground",
                                  )}
                                />
                                {persona.camara === "No"
                                  ? "Sin cámara"
                                  : persona.estado}
                                <ChevronRight className="h-4 w-4" />
                              </span>
                            </button>
                          );
                        if (!captura) return null;
                        return vista === "Muralla" ? (
                          <CardMuralla
                            key={persona.id}
                            p={captura}
                            t={traducir}
                            hace={() => textoHora(persona.observacion!.hora)}
                            sem={sem}
                            onClick={abrir}
                          />
                        ) : (
                          <CeldaCuadricula
                            key={persona.id}
                            p={captura}
                            t={traducir}
                            sem={sem}
                            onClick={abrir}
                          />
                        );
                      })}
                    </div>
                    {(!equipoVisible.length ||
                      (vista !== "Lista" &&
                        !equipoVisible.some((persona) =>
                          capturas.has(persona.id),
                        ))) && (
                      <p className="py-4 text-sm text-muted-foreground">
                        No hay pantallazos con estos filtros.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {tab === "Estado" && (
                <Grupo titulo="Estado de Argos">
                  {subnav(
                    ["Avisos", "Salud de la plataforma"],
                    estado,
                    setEstado,
                  )}
                  <div className="mt-3">
                    {estado === "Avisos" ? (
                      <>
                        <p className="mb-2 text-sm text-muted-foreground">
                          Observaciones, avisos y movimientos con su causa
                          registrada.
                        </p>
                        {lista(
                          delDia.filter((item) => item.tipo !== "Conexión"),
                        )}
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-sm text-muted-foreground">
                          Calidad de llamadas, cortes de conexión y
                          recuperación.
                        </p>
                        {lista(tecnicos)}
                        {tecnicos.length > 0 && (
                          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-sm">
                            <div>
                              <dt className="text-muted-foreground">
                                Cortes registrados
                              </dt>
                              <dd>{tecnicos.length}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Llamadas perdidas
                              </dt>
                              <dd>0</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Recuperación
                              </dt>
                              <dd>42 s</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Ping mediano
                              </dt>
                              <dd>65 ms</dd>
                            </div>
                          </dl>
                        )}
                      </>
                    )}
                  </div>
                </Grupo>
              )}

              {tab === "Historial" && (
                <Grupo titulo="Historial del equipo">
                  {subnav(
                    ["Jornada", "Historial del Hub"],
                    historial,
                    setHistorial,
                  )}
                  <div className="mt-3">
                    {historial === "Jornada" && filtros.fecha === HOY && (
                      <div className="divide-y divide-border/50">
                        {equipoVisible.map((persona) => (
                          <button
                            key={persona.id}
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-3 text-left hover:bg-muted/60"
                            onClick={() => abrirPersona(persona)}
                          >
                            <Identidad persona={persona} />
                            <span className="text-xs text-muted-foreground">
                              Turno {persona.turno} · Entrada {persona.entrada}
                              <ChevronRight className="ml-2 inline h-4 w-4" />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {lista(
                      delDia.filter(
                        (item) =>
                          item.tipo ===
                          (historial === "Jornada" ? "Jornada" : "Hub"),
                      ),
                    )}
                  </div>
                </Grupo>
              )}

              {tab === "Revisión" && (
                <Grupo titulo="Revisión de RR. HH.">
                  {subnav(
                    ["Pendientes", "Revisadas", "Resumen diario"],
                    revision,
                    setRevision,
                  )}
                  <div className="mt-3">
                    {revision === "Pendientes" && lista(pendientes)}
                    {revision === "Revisadas" &&
                      lista(delDia.filter((item) => decisiones[item.id]))}
                    {revision === "Resumen diario" &&
                      equipoVisible.map((persona) => {
                        const casos = delDia.filter(
                          (item) => item.persona === persona.id && item.revisar,
                        );
                        if (!casos.length) return null;
                        return (
                          <button
                            key={persona.id}
                            onClick={() => abrirPersona(persona)}
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-3 text-left hover:bg-muted/60"
                          >
                            <Identidad persona={persona} />
                            <span className="text-sm">
                              {
                                casos.filter((item) => decisiones[item.id])
                                  .length
                              }{" "}
                              de {casos.length} revisadas
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </Grupo>
              )}

              {tab === "Ajustes" && (
                <Grupo titulo="Configuración de Argos">
                  <dl className="grid gap-4 text-sm">
                    <div>
                      <dt className="font-medium">
                        Reglas por empresa y posición
                      </dt>
                      <dd className="text-muted-foreground">
                        Duración, repetición, horario, pausas y herramientas
                        permitidas.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium">Monitor, voz y avisos</dt>
                      <dd className="text-muted-foreground">
                        Se conservan los ajustes actuales. Los umbrales del
                        recorrido son ilustrativos.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium">Permisos</dt>
                      <dd className="text-muted-foreground">
                        Ver equipo, consultar evidencias, revisar episodios y
                        editar reglas.
                      </dd>
                    </div>
                  </dl>
                </Grupo>
              )}
            </div>

            {seleccion && (
              <aside
                ref={panelDetalle}
                tabIndex={-1}
                aria-label="Detalle de Argos"
                className="vidrio order-first min-w-0 rounded-2xl p-4 min-[950px]:order-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <Identidad persona={seleccion} />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDetalle(undefined)}
                    aria-label="Cerrar detalle"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {episodio && (
                  <div className="my-3">
                    <h2 className="font-semibold">{episodio.titulo}</h2>
                    <p className="text-xs text-muted-foreground">
                      {textoHora(episodio.hora)} · {episodio.duracion} ·{" "}
                      {episodio.causa}
                    </p>
                    {episodio.llamadaConfirmada && (
                      <div className="mt-2 rounded-lg border border-border/60 p-2.5 text-xs">
                        <p className="font-semibold">
                          Llamada de atención confirmada
                        </p>
                        <p>
                          {episodio.llamadaConfirmada.por} ·{" "}
                          {textoHora(episodio.llamadaConfirmada.hora)}
                        </p>
                        <p className="text-muted-foreground">
                          {episodio.llamadaConfirmada.motivo}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {subnav(
                  episodio
                    ? [
                        "Cronología",
                        "Evidencia",
                        "Regla",
                        "Informe",
                        "Expediente completo",
                      ]
                    : ["Informe", "Expediente completo"],
                  seccionDetalle,
                  setSeccionDetalle,
                )}
                <div className="mt-3 space-y-3 text-sm">
                  {seccionDetalle === "Informe" && (
                    <InformeTurno
                      persona={seleccion}
                      dia={diaDelDetalle}
                      movimientos={movimientosPersona}
                      decisiones={decisiones}
                      abrirEpisodio={abrirEpisodio}
                    />
                  )}
                  {episodio && seccionDetalle === "Cronología" && (
                    <>
                      <ol className="space-y-3 border-l border-border pl-3">
                        {episodio.movimientos
                          .filter((fila) => !fila[2])
                          .map(([hora, texto]) => (
                            <li key={hora}>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {textoHora(hora)}
                              </span>
                              <p>{texto}</p>
                            </li>
                          ))}
                      </ol>
                      {avisosDe(episodio).length > 0 && (
                        <details className="rounded-xl border border-border/60 p-3">
                          <summary className="font-medium">
                            {avisosDe(episodio).length} avisos agrupados
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {avisosDe(episodio).map(([hora, texto]) => (
                              <li key={hora}>
                                {textoHora(hora)} · {texto}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                  {episodio && seccionDetalle === "Evidencia" && (
                    <>
                      <p>{episodio.evidencia}</p>
                      {episodio.captura && (
                        <figure>
                          <img
                            className="w-full rounded-xl border border-border/60"
                            src={episodio.captura.url}
                            alt={`Captura de ejemplo del episodio a las ${textoHora(episodio.captura.hora)}`}
                          />
                          <figcaption className="mt-1 text-xs text-muted-foreground">
                            Captura del episodio ·{" "}
                            {textoHora(episodio.captura.hora)}
                          </figcaption>
                        </figure>
                      )}
                    </>
                  )}
                  {episodio && seccionDetalle === "Regla" && (
                    <dl className="grid gap-3">
                      <div>
                        <dt className="font-semibold">Regla del puesto</dt>
                        <dd className="text-muted-foreground">
                          {episodio.regla}
                        </dd>
                      </div>
                      {episodio.accion && (
                        <div>
                          <dt className="font-semibold">Acción sugerida</dt>
                          <dd className="text-muted-foreground">
                            {episodio.accion}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {seccionDetalle === "Expediente completo" && (
                    <>
                      {diaDelDetalle === HOY && (
                        <>
                          <PantallaEjemplo persona={seleccion} />
                          <dl className="grid grid-cols-2 gap-3">
                            <div>
                              <dt className="text-muted-foreground">Turno</dt>
                              <dd>{seleccion.turno}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Entrada de hoy
                              </dt>
                              <dd>{seleccion.entrada}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Pantalla ahora
                              </dt>
                              <dd>{seleccion.pantalla}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Cámara ahora
                              </dt>
                              <dd>{seleccion.camara}</dd>
                            </div>
                          </dl>
                        </>
                      )}
                      <h3 className="font-semibold">
                        Movimientos de la fecha seleccionada
                      </h3>
                      {lista(movimientosPersona)}
                    </>
                  )}
                  {episodio?.revisar && seccionDetalle === "Cronología" && (
                    <form
                      className="grid gap-2 border-t border-border/60 pt-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!motivo.trim()) return;
                        setDecisiones({
                          ...decisiones,
                          [episodio.id]: { resultado, motivo: motivo.trim() },
                        });
                        setMensaje(
                          "Decisión de ejemplo guardada. Se actualizó el resumen diario.",
                        );
                      }}
                    >
                      <label>
                        Decisión
                        <select
                          className={selectClass}
                          value={resultado}
                          onChange={(e) =>
                            setResultado(e.target.value as Decision)
                          }
                        >
                          <option>Confirmada</option>
                          <option>Justificada</option>
                          <option>Descartada</option>
                        </select>
                      </label>
                      <label>
                        Motivo de la revisión
                        <Textarea
                          required
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                        />
                      </label>
                      <Button type="submit" disabled={!motivo.trim()}>
                        Guardar revisión de ejemplo
                      </Button>
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        {mensaje}
                      </p>
                    </form>
                  )}
                </div>
              </aside>
            )}
          </div>
        </Page>
      </div>
    </div>
  );
}

const raiz = createRoot(document.getElementById("root")!);
void cargarIdioma("es").then(() => {
  fijarIdioma("es");
  raiz.render(
    <LanguageProvider>
      <MemoryRouter>
        <PreviewArgos />
      </MemoryRouter>
    </LanguageProvider>,
  );
});
