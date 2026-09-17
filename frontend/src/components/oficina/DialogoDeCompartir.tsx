import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { candidatosDelDirectorio, useDirectorioCorreo } from "@/hooks/useDirectorioCorreo";
import {
  useCambiarPermiso, useCompartidos, useCompartir, useDejarDeCompartir,
} from "@/hooks/useCompartidos";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  documentoId: string;
  titulo: string;
  /** Compartir es solo del dueño: si alguien con quien compartiste pudiera
   *  volver a compartir, perderías el control de a dónde llegó tu documento. */
  soyDueno: boolean;
}

export default function DialogoDeCompartir(
  { abierto, onCerrar, documentoId, titulo, soyDueno }: Props,
) {
  const { t } = useLanguage();
  const [busqueda, setBusqueda] = useState("");

  const compartidos = useCompartidos(abierto ? documentoId : undefined);
  const directorio = useDirectorioCorreo(abierto);
  const compartir = useCompartir();
  const cambiar = useCambiarPermiso();
  const dejar = useDejarDeCompartir();

  const lista = compartidos.data ?? [];
  const yaEstan = useMemo(() => new Set(lista.map((c) => c.user_id)), [lista]);
  const gente = directorio.data ?? [];
  const porId = useMemo(() => new Map(gente.map((p) => [p.user_id, p])), [gente]);

  const candidatos = useMemo(() => {
    if (!busqueda.trim() || !soyDueno) return [];
    return candidatosDelDirectorio(gente, busqueda, undefined, 6)
      .filter((p) => !yaEstan.has(p.user_id));
  }, [gente, busqueda, yaEstan, soyDueno]);

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">
            {t("doc.compartirCon")} · {titulo}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {soyDueno ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t("doc.buscarPersona")}
                className="rounded-full pl-9"
                autoFocus
              />
              {candidatos.length > 0 && (
                <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-panel border border-border bg-popover p-1 shadow-md">
                  {candidatos.map((p) => (
                    <li key={p.user_id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          // Se comparte como "puede ver" y el permiso se sube
                          // después: el default menos peligroso es el que no
                          // deja a nadie modificar algo sin querer.
                          compartir.mutate(
                            { documentoId, userId: p.user_id, puedeEditar: false },
                            {
                              onSuccess: () => toast.success(t("doc.compartido")),
                              onError: (e) => toast.error((e as Error).message),
                            },
                          );
                          setBusqueda("");
                        }}
                      >
                        <UserAvatar name={p.nombre} src={p.avatar_url} seed={p.avatar_seed} size="xs" />
                        <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                        <span className="shrink-0 truncate text-xs text-muted-foreground">
                          {p.email_address}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("doc.soloElDueno")}</p>
          )}

          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("doc.sinCompartir")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {lista.map((c) => {
                const p = porId.get(c.user_id);
                return (
                  <li key={c.user_id} className="flex items-center gap-2 text-sm">
                    <UserAvatar name={p?.nombre} src={p?.avatar_url} seed={p?.avatar_seed} size="xs" />
                    <span className="min-w-0 flex-1 truncate">
                      {p?.nombre ?? p?.email_address ?? c.user_id}
                    </span>

                    {soyDueno ? (
                      <div className="flex shrink-0 gap-1 rounded-full bg-muted/60 p-1">
                        {[false, true].map((editar) => (
                          <button
                            key={String(editar)}
                            type="button"
                            disabled={cambiar.isPending}
                            onClick={() =>
                              cambiar.mutate(
                                { documentoId, userId: c.user_id, puedeEditar: editar },
                                {
                                  onSuccess: () => toast.success(t("doc.permisoCambiado")),
                                  onError: (e) => toast.error((e as Error).message),
                                },
                              )
                            }
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                              c.puede_editar === editar
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {t(editar ? "doc.puedeEditar" : "doc.puedeVer")}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t(c.puede_editar ? "doc.puedeEditar" : "doc.puedeVer")}
                      </span>
                    )}

                    {soyDueno && (
                      <button
                        type="button"
                        aria-label={t("doc.dejarDeCompartir")}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          dejar.mutate(
                            { documentoId, userId: c.user_id },
                            { onError: (e) => toast.error((e as Error).message) },
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
