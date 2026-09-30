import { useMemo, useState } from "react";
import { Check, ChevronDown, Link2, Lock, Search, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { candidatosDelDirectorio, useDirectorioCorreo } from "@/hooks/useDirectorioCorreo";
import { useGuardarDocumento, type VisibilidadDocumento } from "@/hooks/useDocumentos";
import {
  useCambiarPermiso, useCompartidos, useCompartir, useDejarDeCompartir,
} from "@/hooks/useCompartidos";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  documentoId: string;
  titulo: string;
  /** Quién lo creó. Va primero en la lista y no se le puede tocar el permiso,
   *  igual que en Google. */
  ownerId: string;
  visibilidad: VisibilidadDocumento;
  /** El acceso general se guarda en `documents.visibility`, que la consulta del
   *  documento cachea para siempre. La página la vuelve a pedir con esto. */
  onVisibilidadCambiada: () => void;
  /** Compartir es solo del dueño: si alguien con quien compartiste pudiera
   *  volver a compartir, perderías el control de a dónde llegó tu documento. */
  soyDueno: boolean;
}

export default function DialogoDeCompartir(
  { abierto, onCerrar, documentoId, titulo, ownerId, visibilidad,
    onVisibilidadCambiada, soyDueno }: Props,
) {
  const { t } = useLanguage();
  const [busqueda, setBusqueda] = useState("");

  const compartidos = useCompartidos(abierto ? documentoId : undefined);
  const directorio = useDirectorioCorreo(abierto);
  const compartir = useCompartir();
  const cambiar = useCambiarPermiso();
  const dejar = useDejarDeCompartir();
  const guardarDoc = useGuardarDocumento();

  const lista = compartidos.data ?? [];
  const yaEstan = useMemo(() => new Set(lista.map((c) => c.user_id)), [lista]);
  const gente = directorio.data ?? [];
  const porId = useMemo(() => new Map(gente.map((p) => [p.user_id, p])), [gente]);
  const dueno = porId.get(ownerId);

  const candidatos = useMemo(() => {
    if (!busqueda.trim() || !soyDueno) return [];
    return candidatosDelDirectorio(gente, busqueda, ownerId, 6)
      .filter((p) => !yaEstan.has(p.user_id));
  }, [gente, busqueda, yaEstan, soyDueno, ownerId]);

  const esDelEquipo = visibilidad === "equipo";

  const copiarLink = async () => {
    const url = `${window.location.origin}/oficina/${documentoId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("doc.linkCopiado"));
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS) no se puede copiar por
      // código: se muestra el link para que se copie a mano en vez de fallar
      // en silencio.
      toast.error(url);
    }
  };

  const cambiarVisibilidad = (v: VisibilidadDocumento) =>
    guardarDoc.mutate({ id: documentoId, visibility: v }, {
      onSuccess: () => {
        onVisibilidadCambiada();
        toast.success(t("doc.visibilidadCambiada"));
      },
      onError: (e) => toast.error((e as Error).message),
    });

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">
            {t("doc.compartirTitulo", { name: titulo })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {soyDueno && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t("doc.agregarPersonas")}
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
          )}

          {/* ── Personas con acceso ──────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("doc.personasConAcceso")}</h3>

            <ul className="flex flex-col">
              {/* El dueño va primero y no lleva menú: nadie le quita el
                  documento a quien lo creó. */}
              <Fila
                nombre={dueno?.nombre ?? t("doc.dueno")}
                email={dueno?.email_address}
                avatarUrl={dueno?.avatar_url}
                avatarSeed={dueno?.avatar_seed}
                sufijo={soyDueno ? t("doc.tu") : undefined}
              >
                <span className="shrink-0 pr-3 text-xs text-muted-foreground">
                  {t("doc.dueno")}
                </span>
              </Fila>

              {lista.map((c) => {
                const p = porId.get(c.user_id);
                return (
                  <Fila
                    key={c.user_id}
                    nombre={p?.nombre ?? p?.email_address ?? c.user_id}
                    email={p?.email_address}
                    avatarUrl={p?.avatar_url}
                    avatarSeed={p?.avatar_seed}
                  >
                    {soyDueno ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={cambiar.isPending || dejar.isPending}
                            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {t(c.puede_editar ? "doc.puedeEditar" : "doc.puedeVer")}
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {[false, true].map((editar) => (
                            <DropdownMenuItem
                              key={String(editar)}
                              onSelect={() =>
                                cambiar.mutate(
                                  { documentoId, userId: c.user_id, puedeEditar: editar },
                                  {
                                    onSuccess: () => toast.success(t("doc.permisoCambiado")),
                                    onError: (e) => toast.error((e as Error).message),
                                  },
                                )
                              }
                            >
                              <Check className={cn(
                                "mr-2 h-4 w-4",
                                c.puede_editar === editar ? "opacity-100" : "opacity-0",
                              )} />
                              {t(editar ? "doc.puedeEditar" : "doc.puedeVer")}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() =>
                              dejar.mutate(
                                { documentoId, userId: c.user_id },
                                { onError: (e) => toast.error((e as Error).message) },
                              )
                            }
                          >
                            <span className="mr-2 h-4 w-4" />
                            {t("doc.quitarAcceso")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="shrink-0 pr-3 text-xs text-muted-foreground">
                        {t(c.puede_editar ? "doc.puedeEditar" : "doc.puedeVer")}
                      </span>
                    )}
                  </Fila>
                );
              })}
            </ul>

            {lista.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("doc.sinCompartir")}</p>
            )}
            {!soyDueno && (
              <p className="text-xs text-muted-foreground">{t("doc.soloElDueno")}</p>
            )}
          </section>

          {/* ── Acceso general ───────────────────────────────────────────────
              Antes esto era un botón suelto arriba del editor, y quedaban dos
              lugares distintos para contestar la misma pregunta: quién lo ve.
              Google los junta aquí y tiene razón. */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("doc.accesoGeneral")}</h3>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted">
                {esDelEquipo
                  ? <Users className="h-4 w-4 text-muted-foreground" />
                  : <Lock className="h-4 w-4 text-muted-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                {soyDueno ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={guardarDoc.isPending}
                        className="-ml-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium transition-colors hover:bg-muted"
                      >
                        {t(esDelEquipo ? "doc.todoMaven" : "doc.restringido")}
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {(["privado", "equipo"] as const).map((v) => (
                        <DropdownMenuItem key={v} onSelect={() => cambiarVisibilidad(v)}>
                          <Check className={cn(
                            "mr-2 h-4 w-4",
                            visibilidad === v ? "opacity-100" : "opacity-0",
                          )} />
                          {t(v === "equipo" ? "doc.todoMaven" : "doc.restringido")}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <p className="text-sm font-medium">
                    {t(esDelEquipo ? "doc.todoMaven" : "doc.restringido")}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(esDelEquipo ? "doc.todoMavenAyuda" : "doc.restringidoAyuda")}
                </p>
                {!soyDueno && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("doc.soloElDuenoAcceso")}
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={copiarLink}>
              <Link2 className="mr-2 h-4 w-4" />
              {t("doc.copiarLink")}
            </Button>
            <Button type="button" className="rounded-full" onClick={onCerrar}>
              {t("doc.listo")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PropsFila {
  nombre: string;
  email?: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  sufijo?: string;
  children: React.ReactNode;
}

/** Una persona de la lista: cara, nombre arriba, correo abajo y a la derecha
 *  lo que pueda hacer. Es la forma de Google y se lee de un vistazo. */
function Fila({ nombre, email, avatarUrl, avatarSeed, sufijo, children }: PropsFila) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <UserAvatar name={nombre} src={avatarUrl} seed={avatarSeed} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">
          {nombre}
          {sufijo && <span className="ml-1 text-muted-foreground">{sufijo}</span>}
        </span>
        {email && (
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        )}
      </span>
      {children}
    </li>
  );
}
