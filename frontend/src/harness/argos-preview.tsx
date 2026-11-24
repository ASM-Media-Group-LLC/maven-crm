// Banco visual local. No se importa desde App.tsx y no usa sesión, base ni capturas reales.
import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CameraOff,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  LayoutDashboard,
  LayoutGrid,
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

const HOY = "2026-11-24";
const personas = [
  {
    id: "laura",
    nombre: "Laura Méndez",
    iniciales: "LM",
    equipo: "Operaciones",
    puesto: "Supervisor",
    turno: "AM",
    estado: "En Cowork",
    entrada: "8:01",
    pantalla: "Sí",
    camara: "No",
    app: "Maven · Cowork",
  },
  {
    id: "diego",
    nombre: "Diego Torres",
    iniciales: "DT",
    equipo: "Operaciones",
    puesto: "Consultor",
    turno: "AM",
    estado: "En reunión",
    entrada: "8:00",
    pantalla: "Sí",
    camara: "Sí",
    app: "Maven · Meet",
  },
  {
    id: "camila",
    nombre: "Camila Ríos",
    iniciales: "CR",
    equipo: "RR. HH.",
    puesto: "Recursos humanos",
    turno: "AM",
    estado: "En Cowork",
    entrada: "8:09",
    pantalla: "Sí",
    camara: "Sí",
    app: "Maven · Horarios",
  },
  {
    id: "mateo",
    nombre: "Mateo Díaz",
    iniciales: "MD",
    equipo: "Operaciones",
    puesto: "Supervisor",
    turno: "PM",
    estado: "Fuera de turno",
    entrada: "—",
    pantalla: "—",
    camara: "—",
    app: "",
  },
];
type Persona = (typeof personas)[number];
type Tipo = "Hub" | "Actividad" | "Jornada" | "Conexión";
type Decision = "Confirmada" | "Justificada" | "Descartada";
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
  movimientos: [hora: string, detalle: string, aviso?: boolean][];
};
const episodios: Episodio[] = [
  {
    id: "1",
    persona: "laura",
    fecha: HOY,
    hora: "10:12",
    tipo: "Hub",
    titulo: "Cámara apagada",
    duracion: "8 min · sigue abierta",
    causa: "Causa sin determinar",
    evidencia:
      "Hub registró el cambio del estado de la cámara a las 10:12. La última señal llegó a las 10:20. No hay un registro que explique por qué se apagó.",
    regla:
      "Supervisores · cámara requerida durante el turno. Revisar después de 5 min en este ejemplo.",
    revisar: true,
    movimientos: [
      ["10:12", "El Hub registró la cámara apagada."],
      ["10:13", "Argos pidió encender la cámara.", true],
      ["10:15", "Argos repitió el aviso.", true],
      ["10:17", "Superó la duración de la regla de su puesto."],
      ["10:18", "Argos volvió a avisar.", true],
      ["10:20", "Última señal: cámara apagada."],
    ],
  },
  {
    id: "2",
    persona: "diego",
    fecha: HOY,
    hora: "10:08",
    tipo: "Conexión",
    titulo: "Pantalla compartida interrumpida",
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
    id: "5",
    persona: "camila",
    fecha: "2026-11-23",
    hora: "12:30",
    tipo: "Jornada",
    titulo: "Pausa de comida",
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
    fecha: "2026-11-23",
    hora: "10:02",
    tipo: "Hub",
    titulo: "Cámara apagada y recuperada",
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
const subtitulo = "Presencia, evidencias y revisión del equipo";
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

function PantallaEjemplo({ persona }: { persona: Persona }) {
  return (
    <div className="relative aspect-video overflow-hidden border-b border-border/60 bg-background/80 text-left">
      <div className="flex h-7 items-center gap-2 border-b border-border/60 px-3 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-success" />
        {persona.app || "Sin captura"}
      </div>
      {persona.app && (
        <div className="grid h-[calc(100%-28px)] grid-cols-[1fr_2.3fr]">
          <div className="space-y-2 border-r border-border/60 p-3">
            {["Equipo", "Conversaciones", "Actividad"].map((texto) => (
              <div
                key={texto}
                className="rounded bg-muted px-2 py-1 text-[10px]"
              >
                {texto}
              </div>
            ))}
          </div>
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 rounded bg-primary/25" />
            <div className="h-5 w-full rounded bg-muted" />
            <div className="h-5 w-4/5 rounded bg-muted" />
            <div className="ml-auto h-5 w-2/3 rounded bg-primary/20" />
          </div>
        </div>
      )}
      <Badge
        variant="outline"
        className="absolute bottom-2 right-2 bg-background/95"
      >
        Captura de ejemplo
      </Badge>
    </div>
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
  const [vista, setVista] = useState("Pantallas");
  const [historial, setHistorial] = useState("Jornada");
  const [estado, setEstado] = useState("Avisos");
  const [revision, setRevision] = useState("Pendientes");
  const [detalle, setDetalle] = useState<{
    persona: string;
    episodio?: string;
  }>();
  const [seccionDetalle, setSeccionDetalle] = useState("Cronología");
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
  const delDia = episodios.filter(
    (episodio) =>
      episodio.fecha === filtros.fecha &&
      equipoVisible.some(({ id }) => id === episodio.persona),
  );
  const pendientes = delDia.filter(
    (episodio) => episodio.revisar && !decisiones[episodio.id],
  );
  const tecnicos = delDia.filter(({ tipo }) => tipo === "Conexión");
  const seleccion = detalle && porId(detalle.persona);
  const episodio = detalle?.episodio
    ? episodios.find(({ id }) => id === detalle.episodio)
    : undefined;

  function abrirPersona(persona: Persona) {
    setDetalle({ persona: persona.id });
    setSeccionDetalle("Expediente");
    setMensaje("");
  }

  function abrirEpisodio(item: Episodio) {
    setDetalle({ persona: item.persona, episodio: item.id });
    setSeccionDetalle("Cronología");
    setResultado(decisiones[item.id]?.resultado ?? "Confirmada");
    setMotivo(decisiones[item.id]?.motivo ?? "");
    setMensaje("");
  }

  function filaEpisodio(item: Episodio) {
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
            {porId(item.persona).nombre} · {item.hora} · {item.duracion}
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

  function lista(items: Episodio[]) {
    return items.length ? (
      <div className="divide-y divide-border/50">{items.map(filaEpisodio)}</div>
    ) : (
      <p className="py-4 text-sm text-muted-foreground">
        Sin movimientos con estos filtros.
      </p>
    );
  }

  function subnav(
    opciones: string[],
    vigente: string,
    elegir: (opcion: string) => void,
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
            title="Argos — Monitor de IA"
            subtitle={subtitulo}
            icon={<Eye />}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    cambiar("Historial");
                    setHistorial("Jornada");
                  }}
                >
                  <CalendarClock className="h-4 w-4" />
                  Horarios
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={exportarHoras}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar horas
                </Button>
                <Button
                  variant={tab === "Ajustes" ? "secondary" : "outline"}
                  size="sm"
                  className="rounded-full"
                  onClick={() => cambiar("Ajustes")}
                >
                  <Settings className="h-4 w-4" />
                  Ajustes
                </Button>
              </>
            }
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Vista previa local · datos de ejemplo
          </p>

          <nav
            aria-label="Secciones de Argos"
            className="mt-4 flex flex-wrap gap-1 rounded-2xl border border-border/50 bg-background/40 p-1"
          >
            {tabs.map(({ nombre, icono: Icono }) => (
              <Button
                key={nombre}
                variant={tab === nombre ? "default" : "ghost"}
                aria-current={tab === nombre ? "page" : undefined}
                onClick={() => cambiar(nombre)}
                className="rounded-xl"
              >
                <Icono className="h-4 w-4" />
                {nombre}
              </Button>
            ))}
          </nav>

          {tab !== "Ajustes" && (
            <div className="my-4 grid grid-cols-2 gap-2 xl:grid-cols-[1fr_1fr_0.65fr_1.3fr]">
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Fecha
                <select
                  className={selectClass}
                  disabled={tab === "En vivo"}
                  value={tab === "En vivo" ? HOY : filtros.fecha}
                  onChange={(e) => fijarFiltro("fecha", e.target.value)}
                >
                  <option value={HOY}>Hoy · 24 nov</option>
                  <option value="2026-11-23">23 nov</option>
                </select>
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
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      {
                        label: "Por revisar",
                        total: pendientes.length,
                        accion: () => {
                          cambiar("Revisión");
                          setRevision("Pendientes");
                        },
                      },
                      {
                        label: "En Cowork ahora",
                        total: equipoVisible.filter(
                          (p) => p.estado === "En Cowork",
                        ).length,
                        accion: () => cambiar("En vivo"),
                      },
                      {
                        label: "Problemas técnicos",
                        total: tecnicos.length,
                        accion: () => {
                          cambiar("Estado");
                          setEstado("Salud de la plataforma");
                        },
                      },
                    ].map(({ label, total, accion }) => (
                      <button
                        key={label}
                        onClick={accion}
                        className="vidrio rounded-2xl px-4 py-3 text-left hover:bg-primary/10"
                      >
                        <span className="flex items-center justify-between text-xs text-muted-foreground">
                          {label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                        <strong className="text-2xl font-semibold tabular-nums">
                          {total}
                        </strong>
                      </button>
                    ))}
                  </div>
                  <Grupo titulo="Incidencias por revisar">
                    {lista(pendientes)}
                  </Grupo>
                  <Grupo titulo="Actividad reciente">
                    {lista(delDia.filter((item) => !pendientes.includes(item)))}
                  </Grupo>
                </>
              )}

              {tab === "En vivo" && (
                <Grupo titulo="Equipo en vivo">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="success-soft">Ahora · 10:20</Badge>
                    <div className="flex gap-1">
                      {(
                        [
                          ["Pantallas", LayoutGrid],
                          ["Presencia", List],
                        ] as const
                      ).map(([nombre, Icono]) => (
                        <Button
                          key={nombre}
                          size="sm"
                          variant={vista === nombre ? "secondary" : "ghost"}
                          aria-pressed={vista === nombre}
                          onClick={() => setVista(nombre)}
                        >
                          <Icono className="h-4 w-4" />
                          {nombre}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {equipoVisible.length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">
                      No hay personas con estos filtros.
                    </p>
                  )}
                  <div
                    className={cn(
                      "grid gap-2",
                      vista === "Pantallas" && "sm:grid-cols-2",
                    )}
                  >
                    {equipoVisible.map((persona) => (
                      <button
                        key={persona.id}
                        onClick={() => abrirPersona(persona)}
                        className="vidrio overflow-hidden rounded-2xl text-left hover:ring-1 hover:ring-primary/50"
                      >
                        {vista === "Pantallas" && (
                          <PantallaEjemplo persona={persona} />
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                          <Identidad persona={persona} />
                          <Badge
                            variant={
                              persona.estado === "Fuera de turno"
                                ? "secondary-soft"
                                : "success-soft"
                            }
                          >
                            {persona.estado}
                          </Badge>
                          {vista === "Presencia" && (
                            <span className="text-xs text-muted-foreground">
                              Pantalla: {persona.pantalla} · Cámara:{" "}
                              {persona.camara}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </Grupo>
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
                      {episodio.hora} · {episodio.duracion} · {episodio.causa}
                    </p>
                  </div>
                )}
                {subnav(
                  episodio
                    ? ["Cronología", "Evidencia", "Regla", "Expediente"]
                    : ["Expediente"],
                  seccionDetalle,
                  setSeccionDetalle,
                )}
                <div className="mt-3 space-y-3 text-sm">
                  {episodio && seccionDetalle === "Cronología" && (
                    <>
                      <ol className="space-y-3 border-l border-border pl-3">
                        {episodio.movimientos
                          .filter((fila) => !fila[2])
                          .map(([hora, texto]) => (
                            <li key={hora}>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {hora}
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
                                {hora} · {texto}
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
                      {episodio.tipo === "Actividad" && (
                        <PantallaEjemplo persona={seleccion} />
                      )}
                    </>
                  )}
                  {episodio && seccionDetalle === "Regla" && (
                    <p>{episodio.regla}</p>
                  )}
                  {seccionDetalle === "Expediente" && (
                    <>
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
                      <h3 className="font-semibold">
                        Movimientos de la fecha seleccionada
                      </h3>
                      {lista(
                        episodios.filter(
                          (item) =>
                            item.persona === seleccion.id &&
                            item.fecha ===
                              (tab === "En vivo" ? HOY : filtros.fecha),
                        ),
                      )}
                    </>
                  )}
                  {episodio?.revisar && seccionDetalle !== "Expediente" && (
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

createRoot(document.getElementById("root")!).render(<PreviewArgos />);
