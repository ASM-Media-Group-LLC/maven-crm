import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isThisYear, isToday } from "date-fns";
import {
  AlertTriangle, Building2, ChevronRight, Clock, File as IconoDeArchivo, FileSpreadsheet, FileText, Folder,
  HardDrive, Loader2, Presentation, Search, Upload, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import type { TranslationKey } from "@/lib/i18n";
import {
  useDriveVista, useRutaDrive, useSubirUnArchivo, useUsoDrive, type DriveItem, type VistaDrive,
} from "@/hooks/useDrive";
import { useEditarEnOficina } from "@/hooks/useVisorDrive";
import { tamano } from "@/lib/drive/formato";
import { destinoEnLaOficina, type DestinoDeOficina } from "@/lib/drive/tipoDeArchivo";
import {
  aceptaElSelector, esAtajoDeAbrir, extensionesDe, paraAbrir, problemaParaSubir, TOPE_COPIA,
  type ProblemaDeSubida,
} from "@/lib/drive/abrirEnLaOficina";
import { soloUnClic } from "@/pages/oficina/drive/gestos";

// «ABRIR UN ARCHIVO» (Jhon, 02/10): «María tiene un Excel que descargó y lo
// quiere abrir en Maven; no veo la opción». Es el Archivo › Abrir (⌘O) de
// Google Hojas de cálculo: pestañas Recientes / Mi unidad / Unidades
// compartidas / Compartido conmigo / Subir, un buscador y el filtro por tipo.
//
// Abrir un archivo del Drive = la copia editable de la Oficina (`desde_drive`,
// el mismo camino que «Editar en Documentos de Maven» del visor del Drive).
// Subir uno = subirlo a «Mi unidad» con la subida de siempre y abrirlo apenas
// queda listo, como hace Google.
//
// ⚠️ El menú Archivo de ONLYOFFICE vive en su iframe y no se puede extender:
// por eso el botón va en el encabezado de Maven, y ⌘O solo llega si el foco no
// está dentro del editor.

type Pestana = Exclude<VistaDrive, "papelera"> | "subir";

const PESTANAS: { id: Pestana; clave: TranslationKey; icono: typeof HardDrive }[] = [
  { id: "recientes", clave: "drive.vista.recientes", icono: Clock },
  { id: "mia", clave: "drive.vista.mia", icono: HardDrive },
  { id: "unidades", clave: "drive.vista.unidades", icono: Building2 },
  { id: "compartido", clave: "drive.vista.compartido", icono: Users },
  { id: "subir", clave: "oficina.abrir.subir", icono: Upload },
];

const FILTRO: Record<DestinoDeOficina, TranslationKey> = {
  docx: "oficina.abrir.filtro.docx", xlsx: "oficina.abrir.filtro.xlsx", pptx: "oficina.abrir.filtro.pptx",
};
const VACIO: Record<DestinoDeOficina | "todos", TranslationKey> = {
  docx: "oficina.abrir.vacio.docx", xlsx: "oficina.abrir.vacio.xlsx", pptx: "oficina.abrir.vacio.pptx",
  todos: "oficina.abrir.vacio.todos",
};
const ICONO: Record<DestinoDeOficina, typeof FileText> = {
  docx: FileText, xlsx: FileSpreadsheet, pptx: Presentation,
};

function cuando(iso: string, f: Formato): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isThisYear(d)) return format(d, f.idioma === "en" ? "MMM d" : "d MMM", { locale: f.fechas });
  return format(d, "d MMM yyyy", { locale: f.fechas });
}

/** «.xlsx, .xls, .ods…» para decir qué formatos sirven. */
const listaDeFormatos = (destino: DestinoDeOficina | null) => extensionesDe(destino).map((e) => `.${e}`).join(", ");

/** ¿Hay OTRO diálogo abierto encima de la página (Compartir, borrar…)? Ahí ⌘O
 *  no abre este: dos diálogos modales se pelean el foco. */
function hayOtroDialogo(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

interface Props {
  abierto: boolean;
  onCambiar: (abierto: boolean) => void;
  /** La sección desde la que se abre: filtra la lista por su tipo. */
  formato: DestinoDeOficina;
}

/** El diálogo y su atajo (⌘O / Ctrl+O). Se monta siempre en la página; el
 *  contenido —y sus consultas al Drive— solo mientras está abierto. */
export default function DialogoAbrirArchivo({ abierto, onCambiar, formato }: Props) {
  const { t } = useLanguage();

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!esAtajoDeAbrir(e)) return;
      // Sin esto el navegador abre SU «Abrir archivo» del sistema.
      e.preventDefault();
      if (e.repeat || (!abierto && hayOtroDialogo())) return;
      onCambiar(true);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, onCambiar]);

  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent
        className="flex h-[min(42rem,calc(100dvh-2rem))] max-w-3xl flex-col gap-4 p-4 focus:outline-none sm:p-6"
        // Con mouse, el foco va al buscador, como en Google. En el teléfono no:
        // abriría el teclado tapando media lista. Y nunca a la primera
        // pestaña: con el anillo del foco parecía la elegida.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const caja = e.currentTarget as HTMLElement;
          const buscador = caja.querySelector<HTMLInputElement>("[data-buscador]");
          if (buscador && window.matchMedia?.("(pointer: fine)").matches) buscador.focus();
          else caja.focus();
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle>{t("oficina.abrir.titulo")}</DialogTitle>
          <DialogDescription className="text-xs">{t("oficina.abrir.descripcion")}</DialogDescription>
        </DialogHeader>
        {abierto && <Contenido formato={formato} onCerrar={() => onCambiar(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ formato, onCerrar }: { formato: DestinoDeOficina; onCerrar: () => void }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const editar = useEditarEnOficina();
  const [pestana, setPestana] = useState<Pestana>("recientes");
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);
  const [seleccionado, setSeleccionado] = useState<DriveItem | null>(null);
  /** El archivo que se está abriendo (la copia tarda: puede haber conversión). */
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  // Si se cierra el diálogo a mitad de camino, la copia (o la subida) termina
  // igual, pero ya no se navega: la persona se fue a otra cosa.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const ocupado = !!abriendo || subiendo;

  /** El camino ÚNICO para abrir: copia editable y al documento nuevo. Tira si
   *  falla, para que cada quien diga el error a su manera. */
  const { mutateAsync: copiar } = editar;
  const abrirEnLaOficina = useCallback(async (id: string) => {
    const { id: documento } = await copiar(id);
    if (!vivo.current) return;
    toast.success(t("drive.visor.copiaLista"));
    onCerrar();
    navigate(`/oficina/${documento}`);
  }, [copiar, navigate, onCerrar, t]);

  const abrirDelDrive = async (a: DriveItem) => {
    if (ocupado || a.tipo !== "archivo") return;
    setError(null);
    setAbriendo(a.nombre);
    try {
      await abrirEnLaOficina(a.id);
    } catch (e) {
      if (vivo.current) setError(t("oficina.abrir.error", { name: a.nombre, motivo: (e as Error).message }));
    } finally {
      if (vivo.current) setAbriendo(null);
    }
  };

  const irA = (p: Pestana, c: string | null = null) => {
    setPestana(p);
    setCarpeta(c);
    setSeleccionado(null);
    setError(null);
    // Se busca en lo que se ve: al cambiar de lugar, la búsqueda vieja ya no
    // es de aquí (entrar a «Contabilidad» buscando «contab» la dejaría vacía).
    setQ("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* En el teléfono las pestañas BAJAN de fila en vez de correrse: «Subir»
          es la última y es justo la que busca quien trae un archivo bajado. */}
      <SubtabNav aria-label={t("oficina.abrir.pestanas")} className="flex-wrap self-start sm:flex-nowrap">
        {PESTANAS.map(({ id, clave, icono: Icono }) => (
          <SubtabNavItem
            key={id}
            active={pestana === id}
            aria-current={pestana === id ? "page" : undefined}
            disabled={ocupado}
            onClick={() => irA(id)}
            className="gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icono className="h-4 w-4" />
            {t(clave)}
          </SubtabNavItem>
        ))}
      </SubtabNav>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-panel border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 break-words">{error}</p>
        </div>
      )}

      {pestana === "subir" ? (
        <SubirParaAbrir
          formato={formato}
          onOcupado={setSubiendo}
          abrirEnLaOficina={abrirEnLaOficina}
          vivo={vivo}
        />
      ) : (
        <ListaParaAbrir
          vista={pestana}
          carpeta={carpeta}
          formato={formato}
          q={q}
          onQ={(v) => { setQ(v); setSeleccionado(null); }}
          todos={todos}
          onTodos={(v) => { setTodos(v); setSeleccionado(null); }}
          seleccionado={seleccionado}
          onSeleccionar={setSeleccionado}
          onEntrar={(c) => irA(pestana, c)}
          onAbrir={abrirDelDrive}
          onSubir={() => irA("subir")}
          abriendo={abriendo}
          ocupado={ocupado}
        />
      )}

      <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" className="rounded-full" onClick={onCerrar}>{t("common.cancel")}</Button>
        {pestana !== "subir" && (
          <Button
            className="rounded-full"
            disabled={!seleccionado || ocupado}
            onClick={() => seleccionado && void abrirDelDrive(seleccionado)}
          >
            {abriendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("oficina.abrir.boton")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Las pestañas del Drive ──────────────────────────────────────────────────

interface PropsDeLista {
  vista: Exclude<VistaDrive, "papelera">;
  carpeta: string | null;
  formato: DestinoDeOficina;
  q: string;
  onQ: (q: string) => void;
  todos: boolean;
  onTodos: (v: boolean) => void;
  seleccionado: DriveItem | null;
  onSeleccionar: (a: DriveItem) => void;
  onEntrar: (carpeta: string | null) => void;
  onAbrir: (a: DriveItem) => void;
  onSubir: () => void;
  abriendo: string | null;
  ocupado: boolean;
}

function ListaParaAbrir({
  vista, carpeta, formato, q, onQ, todos, onTodos, seleccionado, onSeleccionar, onEntrar, onAbrir, onSubir,
  abriendo, ocupado,
}: PropsDeLista) {
  const { t } = useLanguage();
  const f = useFormato();
  // Las mismas consultas que la página del Drive: lo que se ve aquí es lo que
  // la RLS deja ver allá, ni más ni menos.
  const items = useDriveVista(vista, carpeta);
  const ruta = useRutaDrive(carpeta);
  const lista = useMemo(
    () => paraAbrir(items.data ?? [], { destino: formato, todos, q }),
    [items.data, formato, todos, q],
  );
  const raiz = PESTANAS.find((p) => p.id === vista)!;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={t("oficina.abrir.buscar")}
            aria-label={t("oficina.abrir.buscar")}
            data-buscador=""
            className="rounded-full pl-9 pr-9"
          />
          {q && (
            <button
              type="button"
              onClick={() => onQ("")}
              aria-label={t("common.clearSearch")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* El filtro por tipo: como el «Hojas de cálculo» de Google, con la
            salida a todo lo que la Oficina abre. */}
        <div role="group" aria-label={t("oficina.abrir.filtro")} className="flex shrink-0 gap-1 self-start rounded-full bg-muted/60 p-1 sm:self-auto">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={todos === v}
              onClick={() => onTodos(v)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                todos === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(v ? "oficina.abrir.filtro.todos" : FILTRO[formato])}
            </button>
          ))}
        </div>
      </div>

      {/* Migas: Mi unidad › Contabilidad › 2026 */}
      {carpeta && (
        <nav aria-label={t("drive.ruta")} className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
          <button
            type="button"
            onClick={() => onEntrar(null)}
            disabled={ocupado}
            className="rounded-full px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t(raiz.clave)}
          </button>
          {(ruta.data ?? []).map((r, n, todo) => (
            <span key={r.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              {n === todo.length - 1 ? (
                <span className="truncate px-2 py-1 font-medium">{r.nombre}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onEntrar(r.id)}
                  disabled={ocupado}
                  className="truncate rounded-full px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {r.nombre}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto rounded-panel border border-border/60">
        {abriendo && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/85 p-6 text-center backdrop-blur-sm">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <p className="break-words text-sm font-medium">{t("oficina.abrir.abriendo", { name: abriendo })}</p>
              <p className="text-xs text-muted-foreground">{t("oficina.abrir.abriendoAyuda")}</p>
            </div>
          </div>
        )}

        {items.isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : items.error ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-destructive">{t("drive.error")}: {(items.error as Error).message}</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => void items.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <HardDrive className="h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm font-medium">
              {q ? t("oficina.abrir.sinCoincidencias", { q }) : t(VACIO[todos ? "todos" : formato])}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {q
                ? t("oficina.abrir.sinCoincidenciasAyuda")
                : vista === "recientes" && !carpeta
                  ? `${t("oficina.abrir.vacioRecientes")} ${t("oficina.abrir.vacioAyuda")}`
                  : t("oficina.abrir.vacioAyuda")}
            </p>
            {!q && (
              <Button variant="outline" size="sm" className="mt-2 rounded-full" onClick={onSubir}>
                <Upload className="mr-2 h-4 w-4" />
                {t("oficina.abrir.irASubir")}
              </Button>
            )}
          </div>
        ) : (
          <ul aria-label={t(raiz.clave)}>
            {lista.map((i) => (
              <FilaParaAbrir
                key={i.id}
                item={i}
                formatoFecha={f}
                seleccionado={seleccionado?.id === i.id}
                ocupado={ocupado}
                onEntrar={() => onEntrar(i.id)}
                onSeleccionar={() => onSeleccionar(i)}
                onAbrir={() => onAbrir(i)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilaParaAbrir({
  item, formatoFecha, seleccionado, ocupado, onEntrar, onSeleccionar, onAbrir,
}: {
  item: DriveItem;
  formatoFecha: Formato;
  seleccionado: boolean;
  ocupado: boolean;
  onEntrar: () => void;
  onSeleccionar: () => void;
  onAbrir: () => void;
}) {
  const { t } = useLanguage();
  const esCarpeta = item.tipo === "carpeta";
  const destino = esCarpeta ? null : destinoEnLaOficina(item);
  const Icono = esCarpeta ? Folder : destino ? ICONO[destino] : IconoDeArchivo;
  // La copia pasa entera por la edge: lo que pasa del tope se ve, pero no se
  // ofrece (la edge lo rechazaría después de hacer esperar).
  const muyGrande = !esCarpeta && (item.size ?? 0) > TOPE_COPIA;

  return (
    <li className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        disabled={ocupado || muyGrande}
        aria-pressed={esCarpeta ? undefined : seleccionado}
        // Como en Google: una carpeta se abre con un clic; un archivo se elige
        // con un clic y se abre con doble clic, Enter o «Abrir».
        // ⚠️ soloUnClic en la carpeta y `detail <= 1` en el archivo: el
        // segundo clic de un doble clic sobre una carpeta cae en la carpeta
        // NUEVA, y no puede ni elegir ni abrir lo que haya quedado debajo.
        onClick={esCarpeta ? soloUnClic(onEntrar) : (e) => { if (e.detail <= 1) onSeleccionar(); }}
        onDoubleClick={() => { if (!esCarpeta && seleccionado) onAbrir(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !esCarpeta) {
            e.preventDefault();
            onAbrir();
          }
        }}
        className={cn(
          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
          "sm:grid-cols-[minmax(0,1fr)_6rem_5rem]",
          "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent",
          seleccionado && "bg-primary/15 ring-1 ring-inset ring-primary/40 hover:bg-primary/20",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Icono className={cn("h-5 w-5 shrink-0", esCarpeta ? "text-primary" : "text-muted-foreground")} />
          <span className="min-w-0">
            <span className={cn("block truncate", muyGrande && "text-muted-foreground")}>{item.nombre}</span>
            {muyGrande && (
              <span className="block truncate text-xs text-muted-foreground">
                {t("oficina.abrir.muyGrande", { tope: tamano(TOPE_COPIA) })}
              </span>
            )}
          </span>
        </span>
        <span className="hidden truncate text-xs text-muted-foreground sm:block">{cuando(item.updated_at, formatoFecha)}</span>
        <span className="text-right text-xs tabular-nums text-muted-foreground">{esCarpeta ? "" : tamano(item.size)}</span>
      </button>
    </li>
  );
}

// ── Subir ────────────────────────────────────────────────────────────────────

type Fase =
  | { tipo: "inicio" }
  | { tipo: "subiendo"; nombre: string; enviado: number; total: number }
  | { tipo: "abriendo"; nombre: string };

const ERROR_DE_SUBIDA: Record<ProblemaDeSubida, TranslationKey> = {
  formato: "oficina.abrir.subir.error.formato",
  vacio: "oficina.abrir.subir.error.vacio",
  grande: "oficina.abrir.subir.error.grande",
  espacio: "oficina.abrir.subir.error.espacio",
};

function SubirParaAbrir({
  formato, onOcupado, abrirEnLaOficina, vivo,
}: {
  formato: DestinoDeOficina;
  onOcupado: (v: boolean) => void;
  abrirEnLaOficina: (id: string) => Promise<void>;
  vivo: React.MutableRefObject<boolean>;
}) {
  const { t } = useLanguage();
  const subirUno = useSubirUnArchivo();
  const uso = useUsoDrive();
  const input = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>({ tipo: "inicio" });
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const ocupado = fase.tipo !== "inicio";

  useEffect(() => { onOcupado(ocupado); }, [ocupado, onOcupado]);

  const elegido = async (archivos: File[]) => {
    if (ocupado || !archivos.length) return;
    if (archivos.length > 1) {
      setError(t("oficina.abrir.subir.uno"));
      return;
    }
    const f = archivos[0];
    const problema = problemaParaSubir(f, uso.data);
    if (problema) {
      setError(t(ERROR_DE_SUBIDA[problema], {
        name: f.name,
        lista: listaDeFormatos(formato),
        peso: tamano(f.size),
        tope: tamano(TOPE_COPIA),
        usado: tamano(uso.data?.usado ?? 0),
        cupo: tamano(uso.data?.cupo ?? 0),
      }));
      return;
    }
    setError(null);
    setFase({ tipo: "subiendo", nombre: f.name, enviado: 0, total: f.size });

    // 1. A «Mi unidad», con la subida de siempre. Al volver ya está «listo».
    let id: string;
    try {
      id = await subirUno(f, null, (enviado) => {
        if (vivo.current) setFase({ tipo: "subiendo", nombre: f.name, enviado, total: f.size });
      });
    } catch (e) {
      if (vivo.current) {
        setError(t("oficina.abrir.subir.error.subida", { name: f.name, motivo: (e as Error).message }));
        setFase({ tipo: "inicio" });
      }
      return;
    }
    // Se cerró el diálogo mientras subía: el archivo queda en el Drive y no se
    // abre nada por sorpresa.
    if (!vivo.current) {
      toast.info(t("oficina.abrir.subir.quedoEnDrive", { name: f.name }));
      return;
    }

    // 2. La copia editable, y al documento.
    setFase({ tipo: "abriendo", nombre: f.name });
    try {
      await abrirEnLaOficina(id);
    } catch (e) {
      if (vivo.current) {
        setError(t("oficina.abrir.subir.error.abrir", { name: f.name, motivo: (e as Error).message }));
        setFase({ tipo: "inicio" });
      }
    }
  };

  const soltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    void elegido(Array.from(e.dataTransfer.files ?? []));
  };

  const pct = fase.tipo === "subiendo" && fase.total ? Math.min(100, Math.round((fase.enviado / fase.total) * 100)) : 0;

  return (
    <div
      data-testid="zona-de-subida"
      onDragOver={(e) => { if (!ocupado) { e.preventDefault(); setArrastrando(true); } }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-panel border-2 border-dashed border-border/70 p-6 text-center",
        arrastrando && "border-primary bg-primary/5",
      )}
    >
      <input
        ref={input}
        type="file"
        accept={aceptaElSelector()}
        className="hidden"
        data-testid="selector-de-archivo"
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? []);
          e.target.value = "";
          void elegido(archivos);
        }}
      />

      {fase.tipo === "subiendo" ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="w-full break-words text-sm font-medium">{t("oficina.abrir.subir.subiendo", { name: fase.nombre })}</p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={t("oficina.abrir.subir.subiendo", { name: fase.nombre })}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {t("oficina.abrir.subir.progreso", { enviado: tamano(fase.enviado), total: tamano(fase.total) })}
          </p>
        </div>
      ) : fase.tipo === "abriendo" ? (
        <div className="flex max-w-sm flex-col items-center gap-2">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="break-words text-sm font-medium">{t("oficina.abrir.abriendo", { name: fase.nombre })}</p>
          <p className="text-xs text-muted-foreground">{t("oficina.abrir.abriendoAyuda")}</p>
        </div>
      ) : (
        <>
          <Upload className="h-9 w-9 text-muted-foreground/60" />
          <p className="text-sm font-medium">{arrastrando ? t("drive.soltar") : t("oficina.abrir.subir.soltar")}</p>
          <p className="text-xs text-muted-foreground">{t("oficina.abrir.subir.o")}</p>
          <Button className="rounded-full" onClick={() => input.current?.click()}>
            {error ? t("oficina.abrir.subir.otro") : t("oficina.abrir.subir.elegir")}
          </Button>
          <p className="max-w-md text-xs text-muted-foreground [text-wrap:balance]">
            {t("oficina.abrir.subir.ayuda", { tope: tamano(TOPE_COPIA) })}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            {t("oficina.abrir.subir.formatos", { lista: listaDeFormatos(formato) })}
          </p>
          {error && (
            <div role="alert" className="flex max-w-md items-start gap-2 rounded-panel border border-destructive/40 bg-destructive/5 px-3 py-2 text-left text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="min-w-0 flex-1 break-words">{error}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
