import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isThisYear } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileText, Plus, Search, Users, Lock, Trash2, RotateCcw, Loader2, X,
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  useDocumentos, useCrearDocumento, usePapelera, useBorrarDocumento,
  type Documento, type FiltrosDocumentos,
} from "@/hooks/useDocumentos";

function cuando(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isThisYear(d)) return format(d, "d 'de' MMM", { locale: es });
  return format(d, "d MMM yyyy", { locale: es });
}

const VISTAS: { id: FiltrosDocumentos["vista"]; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "mios", label: "Míos" },
  { id: "papelera", label: "Papelera" },
];

export default function OficinaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<FiltrosDocumentos["vista"]>("todos");
  const [confirmarBorrado, setConfirmarBorrado] = useState<Documento | null>(null);

  const docs = useDocumentos({ q, vista });
  const crear = useCrearDocumento();
  const papelera = usePapelera();
  const borrar = useBorrarDocumento();

  const nuevo = () => {
    crear.mutate(undefined, {
      onSuccess: ({ id }) => navigate(`/oficina/${id}`),
      onError: (e) => toast.error((e as Error).message || "No se pudo crear el documento"),
    });
  };

  const mover = (d: Documento, tirar: boolean) => {
    papelera.mutate(
      { id: d.id, tirar },
      {
        onSuccess: () =>
          toast.success(tirar ? "Documento en la papelera" : "Documento restaurado"),
        onError: (e) => toast.error((e as Error).message || "No se pudo mover"),
      },
    );
  };

  const lista = docs.data ?? [];

  return (
    // `Page` pone el scroll propio que exige el AppShell y el padding del
    // sistema. Sin tope de ancho a propósito: en un monitor grande la lista
    // ocupa la pantalla en vez de quedar en una columna perdida en el vacío.
    <Page>
      <div className="flex w-full flex-col gap-5">
        <PageHeader
          title="Oficina"
          subtitle="Documentos del equipo, escritos en Maven"
          icon={<FileText />}
          actions={
            <Button onClick={nuevo} disabled={crear.isPending} className="rounded-full">
              {crear.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Documento nuevo
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en el título y dentro del texto…"
              className="rounded-full pl-9 pr-9"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Limpiar búsqueda"
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
                {v.label}
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
            <p className="text-sm font-medium">No se pudieron cargar los documentos</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(docs.error as Error)?.message}
            </p>
            <Button variant="outline" size="sm" className="mt-3 rounded-full"
              onClick={() => void docs.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : lista.length === 0 ? (
          <div className="rounded-panel border border-dashed border-border py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {q
                ? "Ningún documento coincide"
                : vista === "papelera"
                  ? "La papelera está vacía"
                  : "Todavía no hay documentos"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {q
                ? "Se busca en el título y dentro del texto. Probá con otra palabra."
                : vista === "papelera"
                  ? "Lo que mandes a la papelera aparece acá hasta que lo elimines."
                  : "Empezá por un procedimiento, un guion o un acta de reunión."}
            </p>
            {!q && vista !== "papelera" && (
              <Button onClick={nuevo} variant="outline" size="sm" className="mt-4 rounded-full">
                <Plus className="mr-2 h-4 w-4" />
                Documento nuevo
              </Button>
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
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {d.title || "Sin título"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {d.visibility === "equipo" ? (
                            <><Users className="h-3 w-3" /> Equipo</>
                          ) : (
                            <><Lock className="h-3 w-3" /> Privado</>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{cuando(d.updated_at)}</span>
                        </span>
                      </span>
                    </button>

                    {enPapelera ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost" className="rounded-full"
                          onClick={() => mover(d, false)}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Restaurar
                        </Button>
                        <Button size="icon" variant="ghost"
                          className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                          aria-label="Eliminar definitivamente"
                          onClick={() => setConfirmarBorrado(d)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : esMio ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Mandar ${d.title} a la papelera`}
                        onClick={() => mover(d, true)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Borrar de la papelera SÍ es definitivo, así que se pregunta — y con el
          diálogo de Maven, no el del navegador. */}
      <AlertDialog
        open={!!confirmarBorrado}
        onOpenChange={(o) => { if (!o) setConfirmarBorrado(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{confirmarBorrado?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el documento y todas sus versiones. Esto no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const d = confirmarBorrado;
                setConfirmarBorrado(null);
                if (!d) return;
                borrar.mutate(d.id, {
                  onSuccess: () => toast.success("Documento eliminado"),
                  onError: (e) => toast.error((e as Error).message || "No se pudo eliminar"),
                });
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
