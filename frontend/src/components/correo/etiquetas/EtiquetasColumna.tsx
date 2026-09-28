import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, MoreVertical, Plus, Settings, Tag } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import {
  arbolDeEtiquetas, ramaDe, repartirEnColumna, useBorrarEtiqueta, useEtiquetas,
  type EtiquetaDeCorreo, type NodoEtiqueta,
} from "@/hooks/useEtiquetasCorreo";
import EtiquetaMenu from "./EtiquetaMenu";
import EtiquetaFormDialog from "./EtiquetaFormDialog";
import ColorPersonalizadoDialog from "./ColorPersonalizadoDialog";

const PLEGADAS_KEY = "maven.correo.etiquetasPlegadas";

const leerPlegadas = (): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(PLEGADAS_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
};

type Dialogo =
  | { tipo: "nueva"; madre: string | null }
  | { tipo: "editar"; etiqueta: EtiquetaDeCorreo }
  | { tipo: "color"; etiqueta: EtiquetaDeCorreo; ruta: string }
  | { tipo: "eliminar"; etiqueta: EtiquetaDeCorreo; ruta: string; hijas: number };

/** La sección «Etiquetas» de la columna del correo, como la de Gmail: el
 *  árbol de subetiquetas con su flecha para plegar, el ⋮ de cada una y «Más»
 *  con lo oculto, «Administrar etiquetas» y «Crear etiqueta nueva». Qué va
 *  arriba y qué va a «Más» lo decide `repartirEnColumna`. */
export default function EtiquetasColumna({
  abierta, etiquetaVista, onAbrir, noLeidos, onAdministrar,
}: {
  /** La columna desplegada (con nombres) o plegada (solo iconos). */
  abierta: boolean;
  etiquetaVista: string | null;
  onAbrir: (id: string | null) => void;
  noLeidos: Map<string, number> | undefined;
  onAdministrar: () => void;
}) {
  const { t } = useLanguage();
  const etiquetas = useEtiquetas();
  const borrar = useBorrarEtiqueta();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [verMas, setVerMas] = useState(false);
  const [plegadas, setPlegadas] = useState(leerPlegadas);

  const plegar = (id: string) => {
    setPlegadas((antes) => {
      const nuevas = new Set(antes);
      if (nuevas.has(id)) nuevas.delete(id);
      else nuevas.add(id);
      try { localStorage.setItem(PLEGADAS_KEY, JSON.stringify([...nuevas])); } catch { /* sin storage igual se pliega */ }
      return nuevas;
    });
  };

  const todas = etiquetas.data ?? [];
  const nodos = useMemo(() => arbolDeEtiquetas(etiquetas.data ?? []), [etiquetas.data]);

  const { arriba, enMas } = useMemo(
    () => repartirEnColumna(nodos, { noLeidos, etiquetaVista, plegadas }),
    [nodos, noLeidos, etiquetaVista, plegadas],
  );

  const pedirEliminar = (n: NodoEtiqueta) => setDialogo({
    tipo: "eliminar", etiqueta: n.etiqueta, ruta: n.ruta,
    hijas: ramaDe(n.etiqueta.id, todas).size - 1,
  });

  const eliminar = (e: EtiquetaDeCorreo) => {
    const rama = ramaDe(e.id, todas);
    borrar.mutate(e.id, {
      onSuccess: () => {
        if (etiquetaVista && rama.has(etiquetaVista)) onAbrir(null);
        toast.success(t("mail.labels.deleted"), { description: t("mail.labels.deletedHelp") });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  };

  const fila = (n: NodoEtiqueta, enLaListaDeMas: boolean) => (
    <FilaEtiqueta
      key={n.etiqueta.id}
      nodo={n}
      abierta={abierta}
      // En «Más» van planas y con la ruta completa: sin el árbol alrededor,
      // «Reportes» solo no dice de quién es hija.
      plana={enLaListaDeMas}
      activa={etiquetaVista === n.etiqueta.id}
      sinLeer={noLeidos?.get(n.etiqueta.id) ?? 0}
      plegada={plegadas.has(n.etiqueta.id)}
      onPlegar={() => plegar(n.etiqueta.id)}
      onAbrir={() => onAbrir(etiquetaVista === n.etiqueta.id ? null : n.etiqueta.id)}
      onColorPersonalizado={() => setDialogo({ tipo: "color", etiqueta: n.etiqueta, ruta: n.ruta })}
      onModificar={() => setDialogo({ tipo: "editar", etiqueta: n.etiqueta })}
      onEliminar={() => pedirEliminar(n)}
      onSubetiqueta={() => setDialogo({ tipo: "nueva", madre: n.etiqueta.id })}
    />
  );

  return (
    <>
      {abierta ? (
        <p className="flex items-center justify-between px-3 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
          {t("mail.labels")}
          <button
            type="button"
            aria-label={t("mail.labels.new")}
            title={t("mail.labels.new")}
            onClick={() => setDialogo({ tipo: "nueva", madre: null })}
            className="rounded-full p-0.5 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </p>
      ) : (
        todas.length > 0 && <div className="mx-3 my-2 border-t border-border/60" aria-hidden />
      )}

      {arriba.map((n) => fila(n, false))}

      {/* «Más» solo tiene sentido con la columna desplegada: plegada no hay
          lugar para la ruta ni para los dos accesos de abajo. */}
      {abierta && (
        <>
          <button
            type="button"
            onClick={() => setVerMas((v) => !v)}
            aria-expanded={verMas}
            className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
          >
            {verMas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {verMas ? t("mail.labels.less") : t("mail.labels.more")}
          </button>
          {verMas && (
            <>
              {enMas.map((n) => fila(n, true))}
              <button
                type="button"
                onClick={onAdministrar}
                className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
                {t("mail.labels.manage")}
              </button>
              <button
                type="button"
                onClick={() => setDialogo({ tipo: "nueva", madre: null })}
                className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                {t("mail.labels.new")}
              </button>
            </>
          )}
        </>
      )}

      {dialogo?.tipo === "nueva" && (
        <EtiquetaFormDialog madreInicial={dialogo.madre} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === "editar" && (
        <EtiquetaFormDialog etiqueta={dialogo.etiqueta} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === "color" && (
        <ColorPersonalizadoDialog
          etiqueta={dialogo.etiqueta}
          ruta={dialogo.ruta}
          onCerrar={() => setDialogo(null)}
        />
      )}
      <AlertDialog
        open={dialogo?.tipo === "eliminar"}
        onOpenChange={(v) => !v && setDialogo(null)}
      >
        {dialogo?.tipo === "eliminar" && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("mail.labels.remove.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("mail.labels.remove.body", { name: dialogo.ruta })}
                {dialogo.hijas > 0 && (
                  <> {t("mail.labels.remove.withSublabels", { n: dialogo.hijas })}</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("mail.labels.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => eliminar(dialogo.etiqueta)}>
                {t("mail.labels.remove.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  );
}

function FilaEtiqueta({
  nodo, abierta, plana, activa, sinLeer, plegada, onPlegar, onAbrir,
  onColorPersonalizado, onModificar, onEliminar, onSubetiqueta,
}: {
  nodo: NodoEtiqueta;
  abierta: boolean;
  plana: boolean;
  activa: boolean;
  sinLeer: number;
  plegada: boolean;
  onPlegar: () => void;
  onAbrir: () => void;
  onColorPersonalizado: () => void;
  onModificar: () => void;
  onEliminar: () => void;
  onSubetiqueta: () => void;
}) {
  const { t } = useLanguage();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const e = nodo.etiqueta;
  const nombre = plana ? nodo.ruta : e.nombre;
  const sangria = abierta && !plana ? nodo.nivel * 14 : 0;
  const conFlecha = abierta && !plana && nodo.tieneHijas;

  return (
    // ⚠️ Un div y no un botón: adentro van TRES botones (plegar, abrir y ⋮), y
    // un botón dentro de otro es HTML inválido que el navegador desarma.
    <div
      className={cn(
        "group relative flex w-full items-center rounded-2xl text-sm transition-colors",
        activa
          ? "bg-primary/12 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
          : sinLeer > 0
            ? "font-semibold text-foreground hover:bg-primary/5"
            : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
      )}
    >
      {conFlecha && (
        <button
          type="button"
          onClick={onPlegar}
          aria-expanded={!plegada}
          aria-label={t(plegada ? "mail.labels.expand" : "mail.labels.collapse", { name: e.nombre })}
          className="absolute top-1/2 z-10 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          style={{ left: sangria - 2 }}
        >
          {plegada ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}
      <button
        type="button"
        onClick={onAbrir}
        title={abierta ? undefined : nodo.ruta}
        aria-label={nodo.ruta}
        aria-current={activa ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left",
          abierta ? "pr-1" : "justify-center px-0",
        )}
        style={abierta ? { paddingLeft: 12 + sangria } : undefined}
      >
        {/* Icono de ETIQUETA relleno de su color, como en Gmail. Sin color, el
            contorno gris: se distingue de «tiene color gris». */}
        <span className="relative shrink-0">
          <Tag
            className={cn("h-4 w-4", !e.color && "text-muted-foreground")}
            style={e.color ? { color: e.color.fondo, fill: e.color.fondo } : undefined}
          />
          {!abierta && sinLeer > 0 && (
            <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-primary px-1 text-[9px] font-bold leading-[15px] text-primary-foreground">
              {sinLeer > 9 ? "9+" : sinLeer}
            </span>
          )}
        </span>
        {abierta && <span className="truncate">{nombre}</span>}
      </button>

      {abierta && (
        <div className="relative mr-1 flex h-6 w-7 shrink-0 items-center justify-center">
          {/* El número y el ⋮ comparten lugar: al pasar el mouse (o con el
              menú abierto) el ⋮ reemplaza al número, como en Gmail. */}
          {sinLeer > 0 && (
            <span
              className={cn(
                "rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground group-hover:hidden",
                menuAbierto && "hidden",
              )}
            >
              {sinLeer > 99 ? "99+" : sinLeer}
            </span>
          )}
          <DropdownMenu open={menuAbierto} onOpenChange={setMenuAbierto}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("mail.labels.options", { name: nodo.ruta })}
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100",
                  menuAbierto ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <EtiquetaMenu
              etiqueta={e}
              onColorPersonalizado={onColorPersonalizado}
              onModificar={onModificar}
              onEliminar={onEliminar}
              onSubetiqueta={onSubetiqueta}
            />
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
