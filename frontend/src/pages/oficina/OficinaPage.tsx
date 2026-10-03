import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, FileSpreadsheet, FolderOpen, Presentation, Plus, Search, Users, Lock,
  Trash2, RotateCcw, Loader2, X, MoreVertical, Pencil, Share2, ExternalLink,
} from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  useDocumentos, usePapelera, useBorrarDocumento, useRenombrarDocumento, useDocumentosQuePuedoEditar,
  puedoEditarDocumento, SIN_PERMISO_DOCUMENTO,
  type Documento, type FiltrosDocumentos,
} from "@/hooks/useDocumentos";
import { useCrearDocumentoOffice, type FormatoDeOficina } from "@/hooks/useOnlyOffice";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { useFechasDeArchivos } from "@/hooks/useFechasDeArchivos";
import DialogoAbrirArchivo from "@/components/oficina/DialogoAbrirArchivo";
import DialogoDeNombre from "@/components/oficina/DialogoDeNombre";
import DialogoDeCompartir from "@/components/oficina/DialogoDeCompartir";
import { atajoDeAbrir } from "@/lib/drive/abrirEnLaOficina";

/** Cada formato es su propia sección del menú, como en Google: la lista de
 *  hojas no se mezcla con la de documentos. Lo único que cambia es el formato
 *  con el que nacen y cómo se llaman las cosas. */
const FORMATOS: Record<FormatoDeOficina, {
  titulo: TranslationKey;
  nuevo: TranslationKey;
  icono: typeof FileText;
  vacio: TranslationKey;
  ayuda: TranslationKey;
}> = {
  docx: {
    titulo: "nav.office.docs", nuevo: "oficina.nuevoDoc", icono: FileText,
    vacio: "oficina.empty.docs",
    ayuda: "oficina.emptyHint.docs",
  },
  xlsx: {
    titulo: "nav.office.sheets", nuevo: "oficina.nuevaHoja", icono: FileSpreadsheet,
    vacio: "oficina.empty.sheets",
    ayuda: "oficina.emptyHint.sheets",
  },
  pptx: {
    titulo: "nav.office.slides", nuevo: "oficina.nuevaPresentacion", icono: Presentation,
    vacio: "oficina.empty.slides",
    ayuda: "oficina.emptyHint.slides",
  },
};

// `id` es el filtro que se le pasa a la consulta (dato); lo que se ve es `label`.
const VISTAS: { id: FiltrosDocumentos["vista"]; label: TranslationKey }[] = [
  { id: "todos", label: "common.all" },
  { id: "mios", label: "oficina.view.mine" },
  { id: "papelera", label: "oficina.view.trash" },
];

export default function OficinaPage({ formato = "docx" }: { formato?: FormatoDeOficina }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const fechas = useFechasDeArchivos();
  const cfg = FORMATOS[formato];
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<FiltrosDocumentos["vista"]>("todos");
  const [confirmarBorrado, setConfirmarBorrado] = useState<Documento | null>(null);
  /** «Abrir un archivo» (⌘O): uno del Drive o uno de la computadora. */
  const [abriendoArchivo, setAbriendoArchivo] = useState(false);
  /** «Cambiar nombre» y «Compartir» del menú ⋮ de una fila. */
  const [renombrando, setRenombrando] = useState<Documento | null>(null);
  const [compartiendo, setCompartiendo] = useState<Documento | null>(null);

  const docs = useDocumentos({ q, vista, extension: formato });
  const crear = useCrearDocumentoOffice();
  const papelera = usePapelera();
  const borrar = useBorrarDocumento();
  const renombrar = useRenombrarDocumento();
  const paraEditar = useDocumentosQuePuedoEditar();

  const nuevo = () => {
    crear.mutate({ extension: formato }, {
      onSuccess: ({ id }) => navigate(`/oficina/${id}`),
      onError: (e) => toast.error((e as Error).message || t("oficina.createError")),
    });
  };

  const mover = (d: Documento, tirar: boolean) => {
    papelera.mutate(
      { id: d.id, tirar },
      {
        // Como Google: «Movido a la papelera · Deshacer».
        onSuccess: () => (tirar
          ? toast.success(t("oficina.trashed"), {
            action: { label: t("drive.mover.deshacer"), onClick: () => mover(d, false) },
          })
          : toast.success(t("oficina.restored"))),
        onError: (e) => toast.error((e as Error).message || t("oficina.moveError")),
      },
    );
  };

  const cambiarNombre = (d: Documento, title: string) =>
    renombrar.mutate({ id: d.id, title }, {
      onSuccess: () => setRenombrando(null),
      onError: (e) => toast.error((e as Error).message === SIN_PERMISO_DOCUMENTO
        ? t("oficina.rename.sinPermiso")
        : `${t("oficina.rename.error")}: ${(e as Error).message}`),
    });

  const lista = docs.data ?? [];

  return (
    // `Page` pone el scroll propio que exige el AppShell y el padding del
    // sistema. Sin tope de ancho a propósito: en un monitor grande la lista
    // ocupa la pantalla en vez de quedar en una columna perdida en el vacío.
    <Page>
      <div className="flex w-full flex-col gap-5">
        <PageHeader
          title={t(cfg.titulo)}
          subtitle={t("oficina.subtitle")}
          icon={<cfg.icono />}
          actions={
            <>
              {/* Como Archivo › Abrir de Google: para el Excel que alguien
                  bajó y quiere seguir en Maven. */}
              <Button
                variant="outline"
                onClick={() => setAbriendoArchivo(true)}
                className="rounded-full"
                title={t("oficina.abrir.botonAyuda", { atajo: atajoDeAbrir() })}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                {t("oficina.abrir.boton")}
              </Button>
              <Button onClick={nuevo} disabled={crear.isPending} className="rounded-full">
                {crear.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {t(cfg.nuevo)}
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("oficina.searchPlaceholder")}
              className="rounded-full pl-9 pr-9"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label={t("common.clearSearch")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex shrink-0 gap-1 rounded-full bg-muted/60 p-1">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVista(v.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  vista === v.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(v.label)}
              </button>
            ))}
          </div>
        </div>

        {docs.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-panel" />
            ))}
          </div>
        ) : docs.isError ? (
          <div className="rounded-panel border border-destructive/40 bg-destructive/5 p-6 text-center">
            <p className="text-sm font-medium">{t("oficina.loadError")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(docs.error as Error)?.message}
            </p>
            <Button variant="outline" size="sm" className="mt-3 rounded-full"
              onClick={() => void docs.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : lista.length === 0 ? (
          <div className="rounded-panel border border-dashed border-border py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {q
                ? t("oficina.noMatch")
                : vista === "papelera"
                  ? t("oficina.trashEmpty")
                  : t(cfg.vacio)}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {q
                ? t("oficina.noMatchHint")
                : vista === "papelera"
                  ? t("oficina.trashEmptyHint")
                  : t(cfg.ayuda)}
            </p>
            {!q && vista !== "papelera" && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={nuevo} variant="outline" size="sm" className="rounded-full">
                  <Plus className="mr-2 h-4 w-4" />
                  {t(cfg.nuevo)}
                </Button>
                <Button onClick={() => setAbriendoArchivo(true)} variant="ghost" size="sm" className="rounded-full">
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {t("oficina.abrir.titulo")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lista.map((d) => {
              const esMio = d.owner_id === user?.id;
              const enPapelera = !!d.deleted_at;
              return (
                <li key={d.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-3 rounded-panel border border-border/60 bg-card px-3 py-2.5",
                      "transition-colors hover:border-border hover:bg-muted/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => !enPapelera && navigate(`/oficina/${d.id}`)}
                      disabled={enPapelera}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                    >
                      <cfg.icono className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {d.title || t("oficina.untitled")}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {d.visibility === "equipo" ? (
                            <><Users className="h-3 w-3" /> {t("common.team")}</>
                          ) : (
                            <><Lock className="h-3 w-3" /> {t("oficina.private")}</>
                          )}
                          <span aria-hidden="true">·</span>
                          <time dateTime={d.updated_at} title={fechas.completa(d.updated_at)}>{fechas.corta(d.updated_at)}</time>
                        </span>
                      </span>
                    </button>

                    {enPapelera ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost" className="rounded-full"
                          onClick={() => mover(d, false)}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          {t("oficina.restore")}
                        </Button>
                        <Button size="icon" variant="ghost"
                          className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                          aria-label={t("oficina.deleteForever")}
                          onClick={() => setConfirmarBorrado(d)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      // El menú ⋮ de Google Docs: abrir, abrir aparte, cambiar
                      // el nombre, compartir y la papelera (esta, solo el
                      // dueño: a los demás el trigger tocar_documento no los
                      // deja esconderlo).
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                            aria-label={t("oficina.menu.opciones", { name: d.title || t("oficina.untitled") })}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuItem onSelect={() => navigate(`/oficina/${d.id}`)}>
                            <cfg.icono className="mr-2 h-4 w-4" />{t("oficina.menu.abrir")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => window.open(`/oficina/${d.id}`, "_blank", "noopener")}>
                            <ExternalLink className="mr-2 h-4 w-4" />{t("oficina.menu.abrirPestana")}
                          </DropdownMenuItem>
                          {puedoEditarDocumento(d, user?.id, paraEditar.data) && (
                            <DropdownMenuItem onSelect={() => setRenombrando(d)}>
                              <Pencil className="mr-2 h-4 w-4" />{t("oficina.menu.renombrar")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => setCompartiendo(d)}>
                            <Share2 className="mr-2 h-4 w-4" />{t("oficina.menu.compartir")}
                          </DropdownMenuItem>
                          {esMio && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => mover(d, true)}>
                                <Trash2 className="mr-2 h-4 w-4" />{t("oficina.menu.papelera")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DialogoAbrirArchivo abierto={abriendoArchivo} onCambiar={setAbriendoArchivo} formato={formato} />

      {renombrando && (
        <DialogoDeNombre
          titulo={t("oficina.rename.titulo")}
          etiqueta={t("oficina.rename.etiqueta")}
          inicial={renombrando.title}
          boton={t("oficina.rename.guardar")}
          ocupado={renombrar.isPending}
          renombrando
          maximo={200}
          onCerrar={() => setRenombrando(null)}
          onGuardar={(title) => cambiarNombre(renombrando, title)}
        />
      )}

      {compartiendo && (
        <DialogoDeCompartir
          abierto
          onCerrar={() => setCompartiendo(null)}
          documentoId={compartiendo.id}
          titulo={compartiendo.title || t("oficina.untitled")}
          ownerId={compartiendo.owner_id}
          visibilidad={compartiendo.visibility}
          onVisibilidadCambiada={() => {
            // La fila tiene que mostrar el acceso nuevo (Equipo / Privado).
            void docs.refetch().then((r) => {
              const nuevo = r.data?.find((x) => x.id === compartiendo.id);
              if (nuevo) setCompartiendo(nuevo);
            });
          }}
          soyDueno={compartiendo.owner_id === user?.id}
        />
      )}

      {/* Borrar de la papelera SÍ es definitivo, así que se pregunta — y con el
          diálogo de Maven, no el del navegador. */}
      <AlertDialog
        open={!!confirmarBorrado}
        onOpenChange={(o) => { if (!o) setConfirmarBorrado(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("oficina.deleteTitle", { name: confirmarBorrado?.title ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("oficina.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" />
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const d = confirmarBorrado;
                setConfirmarBorrado(null);
                if (!d) return;
                borrar.mutate(d.id, {
                  onSuccess: () => toast.success(t("oficina.deleted")),
                  onError: (e) => toast.error((e as Error).message || t("common.couldNotDelete")),
                });
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>

          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
