import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Check, FileText, History, Loader2, Lock, Users, RotateCcw, WifiOff } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  BarraDeFormato, CuerpoDelEditor, useEditorDocumento,
} from "@/components/oficina/EditorDocumento";
import {
  useDocumento, useGuardarDocumento, useVersionesDeDocumento,
  type VisibilidadDocumento,
} from "@/hooks/useDocumentos";
import {
  useColaboracionDocumento, type Participante,
} from "@/hooks/useColaboracionDocumento";

/** Cuánto se espera después de la última tecla para guardar. 1,2 s es el punto
 *  donde ya no se guarda en cada letra pero tampoco se siente que no guarda. */
const ESPERA_GUARDADO_MS = 1200;

type EstadoGuardado = "limpio" | "pendiente" | "guardando" | "error";

function cuando(iso: string): string {
  const d = new Date(iso);
  return isToday(d)
    ? `hoy a las ${format(d, "HH:mm")}`
    : format(d, "d 'de' MMM 'a las' HH:mm", { locale: es });
}

export default function DocumentoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const doc = useDocumento(id);
  const guardar = useGuardarDocumento();

  const [titulo, setTitulo] = useState("");
  const [estado, setEstado] = useState<EstadoGuardado>("limpio");
  const [verVersiones, setVerVersiones] = useState(false);
  // Siempre habilitada, no solo con el diálogo abierto: en pantalla ancha el
  // historial vive en el panel lateral y tiene que estar ahí sin pedirlo.
  const versiones = useVersionesDeDocumento(id, true);
  // Si no hay servidor de edición compartida configurado devuelve `null` y todo
  // sigue funcionando de a uno, como en la Fase 1.
  const colaboracion = useColaboracionDocumento(id);

  // Lo último escrito, fuera de React: el temporizador del guardado lo lee
  // cuando se dispara, y guardarlo en estado provocaría un render por tecla.
  const pendiente = useRef<{ html: string; texto: string; title?: string } | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargado = doc.data;
  const esMio = cargado?.owner_id === user?.id;

  useEffect(() => {
    if (cargado) setTitulo(cargado.title);
  }, [cargado?.id, cargado?.title]);

  const guardarYa = useCallback(() => {
    if (!id || !pendiente.current) return;
    const cambios = pendiente.current;
    pendiente.current = null;
    setEstado("guardando");
    guardar.mutate(
      {
        id,
        content_html: cambios.html,
        content_text: cambios.texto,
        ...(cambios.title !== undefined ? { title: cambios.title } : {}),
      },
      {
        onSuccess: () => setEstado((e) => (e === "guardando" ? "limpio" : e)),
        onError: (e) => {
          setEstado("error");
          toast.error((e as Error).message || "No se pudo guardar");
        },
      },
    );
  }, [id, guardar]);

  const programarGuardado = useCallback(() => {
    setEstado("pendiente");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(guardarYa, ESPERA_GUARDADO_MS);
  }, [guardarYa]);

  const alEscribir = useCallback(
    (html: string, texto: string) => {
      pendiente.current = { ...(pendiente.current ?? {}), html, texto };
      programarGuardado();
    },
    [programarGuardado],
  );

  const editor = useEditorDocumento(cargado?.content_html ?? "", alEscribir, colaboracion);

  // Al salir de la página se guarda lo que quedó en el aire. Sin esto, escribir
  // y navegar enseguida pierde la última frase.
  useEffect(() => {
    return () => {
      if (reloj.current) clearTimeout(reloj.current);
      if (pendiente.current && id) {
        const c = pendiente.current;
        void guardar.mutateAsync({
          id,
          content_html: c.html,
          content_text: c.texto,
          ...(c.title !== undefined ? { title: c.title } : {}),
        }).catch(() => { /* ya se avisó al usuario si falla mientras estaba */ });
      }
    };
    // Solo al desmontar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Cerrar la pestaña con cambios sin guardar avisa, como cualquier editor.
  useEffect(() => {
    const alCerrar = (e: BeforeUnloadEvent) => {
      if (pendiente.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", alCerrar);
    return () => window.removeEventListener("beforeunload", alCerrar);
  }, []);

  const cambiarTitulo = (v: string) => {
    setTitulo(v);
    pendiente.current = {
      html: pendiente.current?.html ?? editor?.getHTML() ?? "",
      texto: pendiente.current?.texto ?? editor?.getText() ?? "",
      title: v.trim() || "Sin título",
    };
    programarGuardado();
  };

  const cambiarVisibilidad = (v: VisibilidadDocumento) => {
    if (!id) return;
    guardar.mutate(
      { id, visibility: v },
      {
        onSuccess: () => {
          void doc.refetch();
          toast.success(v === "equipo" ? "Ahora lo ve todo el equipo" : "Ahora es privado");
        },
        onError: (e) => toast.error((e as Error).message || "No se pudo cambiar"),
      },
    );
  };

  const restaurar = (html: string) => {
    if (!editor) return;
    editor.commands.setContent(html, false);
    alEscribir(html, editor.getText());
    setVerVersiones(false);
    toast.success("Versión restaurada. Se guarda sola en un momento.");
  };

  if (doc.isPending) {
    return (
      <Page>
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    );
  }

  if (doc.isError || !cargado) {
    return (
      <Page>
        <div className="mx-auto max-w-lg py-10 text-center">
          <p className="text-sm font-medium">No se pudo abrir el documento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(doc.error as Error)?.message ||
              "Puede que lo hayan borrado o que no tengas acceso."}
          </p>
          <Button variant="outline" size="sm" className="mt-4 rounded-full"
            onClick={() => navigate("/oficina")}>
            Volver a Oficina
          </Button>
        </div>
      </Page>
    );
  }

  const acciones = (
    <>
      {colaboracion && <Presentes participantes={colaboracion.participantes} />}
      <EstadoDeGuardado estado={estado} />
      <Button size="sm" variant="ghost" className="shrink-0 rounded-full xl:hidden"
        onClick={() => setVerVersiones(true)}>
        <History className="mr-1.5 h-4 w-4" />
        Versiones
      </Button>
      {/* La visibilidad la cambia solo el dueño: si cualquiera pudiera volverlo
          privado, se lo estaría quitando al resto del equipo. */}
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 rounded-full"
        disabled={!esMio || guardar.isPending}
        title={esMio ? undefined : "Solo quien lo creó puede cambiar quién lo ve"}
        onClick={() =>
          cambiarVisibilidad(cargado.visibility === "equipo" ? "privado" : "equipo")
        }
      >
        {cargado.visibility === "equipo" ? (
          <><Users className="mr-1.5 h-4 w-4" /> Equipo</>
        ) : (
          <><Lock className="mr-1.5 h-4 w-4" /> Privado</>
        )}
      </Button>
      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full"
        aria-label="Volver a Oficina" onClick={() => navigate("/oficina")}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </>
  );

  return (
    <Page>
      <div className="flex w-full flex-col gap-5">
        <PageHeader
          icon={<FileText />}
          // El título del documento ES el título de la pantalla, y se edita en
          // el sitio: abrir un diálogo para renombrar un documento es un paso
          // que no existe en ningún editor.
          title={
            // El ancho va acotado a mano: el bloque del título del PageHeader es
            // `shrink-0`, así que un input sin ancho propio se encoge al tamaño
            // por defecto del navegador y cortaba el título a media palabra.
            <div className="w-[clamp(11rem,42vw,34rem)]">
              <Input
                value={titulo}
                onChange={(e) => cambiarTitulo(e.target.value)}
                placeholder="Sin título"
                aria-label="Título del documento"
                className={cn(
                  // `md:text-2xl` además de `text-2xl`: el Input del sistema trae
                  // `md:text-sm`, que es otra variante y le gana de md para
                  // arriba — el título salía en cuerpo de texto en escritorio.
                  "h-auto w-full border-0 bg-transparent px-0 py-0 shadow-none",
                  "text-2xl font-semibold md:text-2xl",
                  "focus-visible:ring-0 focus-visible:ring-offset-0",
                )}
              />
            </div>
          }
          subtitle={`Última edición ${cuando(cargado.updated_at)}`}
          actions={acciones}
        />

        {colaboracion && (colaboracion.rechazado || colaboracion.estado === "disconnected") && (
          <div className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-muted-foreground">
              {colaboracion.rechazado
                ? "No se pudo entrar a la edición compartida. Lo que escribas se guarda igual, pero por ahora no lo ven los demás en vivo."
                : "Se perdió la conexión con la edición compartida. Se sigue guardando y se reconecta solo; mientras tanto, los demás no ven tus cambios al instante."}
            </p>
          </div>
        )}

        {/* En un monitor grande el documento no se queda en una columna sola en
            medio del vacío: el historial se abre al lado. Debajo de xl, el
            mismo historial vive en el diálogo. */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="mx-auto w-full max-w-3xl rounded-panel border border-border/60 bg-card">
            <BarraDeFormato editor={editor} />
            <div className="px-3 pb-6 pt-1 sm:px-5">
              <CuerpoDelEditor editor={editor} />
            </div>
          </div>

          <aside className="hidden xl:flex xl:flex-col xl:gap-3">
            <div className="rounded-panel border border-border/60 bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <History className="h-4 w-4 text-muted-foreground" />
                Versiones
              </p>
              <div className="mt-3">
                <ListaDeVersiones
                  versiones={versiones.data ?? []}
                  cargando={versiones.isPending}
                  onRestaurar={restaurar}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Dialog open={verVersiones} onOpenChange={setVerVersiones}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Versiones</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <ListaDeVersiones
              versiones={versiones.data ?? []}
              cargando={versiones.isPending}
              onRestaurar={restaurar}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

/** El historial, en el panel lateral y en el diálogo: una sola pieza para que
 *  no se separen con el tiempo. */
function ListaDeVersiones({
  versiones, cargando, onRestaurar,
}: {
  versiones: { id: string; created_at: string; content_html: string }[];
  cargando: boolean;
  onRestaurar: (html: string) => void;
}) {
  if (cargando) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (versiones.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Todavía no hay versiones anteriores. Se guarda una sola cuando el
        documento cambia, como mucho una cada 10 minutos.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {versiones.map((v) => (
        <li key={v.id} className="rounded-panel border border-border/60 p-3">
          <p className="text-xs font-medium">{cuando(v.created_at)}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {v.content_html.replace(/<[^>]+>/g, " ").trim().slice(0, 140) || "(vacío)"}
          </p>
          <Button size="sm" variant="outline" className="mt-2 rounded-full"
            onClick={() => onRestaurar(v.content_html)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Restaurar
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Quiénes están en el documento ahora mismo. Las iniciales alcanzan: son
 *  compañeros de equipo y el color del borde es el mismo de su cursor, así que
 *  la burbuja de arriba y la marca en el texto se leen como la misma persona. */
function Presentes({ participantes }: { participantes: Participante[] }) {
  if (participantes.length === 0) return null;
  const visibles = participantes.slice(0, 4);
  const resto = participantes.length - visibles.length;
  return (
    <div className="flex shrink-0 items-center -space-x-1.5">
      {visibles.map((p) => (
        <span
          key={p.id}
          title={p.nombre}
          style={{ borderColor: p.color }}
          className="grid h-7 w-7 place-items-center rounded-full border-2 bg-muted text-[10px] font-semibold uppercase"
        >
          {p.nombre.slice(0, 2)}
        </span>
      ))}
      {resto > 0 && (
        <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-border bg-muted text-[10px] font-semibold">
          +{resto}
        </span>
      )}
    </div>
  );
}

function EstadoDeGuardado({ estado }: { estado: EstadoGuardado }) {
  if (estado === "limpio") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Guardado
      </span>
    );
  }
  if (estado === "error") {
    return <span className="shrink-0 text-xs text-destructive">No se pudo guardar</span>;
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Guardando…
    </span>
  );
}
