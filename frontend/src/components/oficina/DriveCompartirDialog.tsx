import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/hooks/useLanguage";
import { candidatosDelDirectorio, useDirectorioCorreo } from "@/hooks/useDirectorioCorreo";
import { useCompartidosDrive, useCompartirDrive, type DriveItem } from "@/hooks/useDrive";

/** Compartir un archivo o una carpeta del Drive, como Google: se busca a la
 *  persona, entra como Lector y el permiso se sube después. El directorio es
 *  el mismo del Correo (gente con casilla en Maven); la base además rechaza a
 *  cualquiera de otra agencia. */
export default function DriveCompartirDialog({ item, onCerrar }: { item: DriveItem; onCerrar: () => void }) {
  const { t } = useLanguage();
  const [busqueda, setBusqueda] = useState("");
  const compartidos = useCompartidosDrive(item.id);
  const directorio = useDirectorioCorreo(true);
  const compartir = useCompartirDrive();

  const gente = directorio.data ?? [];
  const porId = useMemo(() => new Map(gente.map((p) => [p.user_id, p])), [gente]);
  const lista = compartidos.data ?? [];
  const yaEstan = useMemo(() => new Set(lista.map((c) => c.user_id)), [lista]);
  const candidatos = useMemo(() => {
    if (!busqueda.trim()) return [];
    return candidatosDelDirectorio(gente, busqueda, item.owner_id ?? undefined, 6).filter((p) => !yaEstan.has(p.user_id));
  }, [gente, busqueda, yaEstan, item.owner_id]);

  const alFallar = (e: unknown) => toast.error((e as Error).message);
  const dueno = item.owner_id ? porId.get(item.owner_id) : undefined;

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{t("drive.compartir.titulo", { name: item.nombre })}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t("drive.compartir.buscar")}
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
                    onClick={() => compartir.mutate({ itemId: item.id, userId: p.user_id, rol: "lector" }, {
                      onSuccess: () => { setBusqueda(""); toast.success(t("drive.compartir.listo")); },
                      onError: alFallar,
                    })}
                  >
                    <UserAvatar name={p.nombre} seed={p.avatar_seed} src={p.avatar_url} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.email_address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("drive.compartir.ayuda")}</p>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("drive.compartir.conQuien")}</p>
          {dueno && (
            <div className="flex items-center gap-2 py-1.5 text-sm">
              <UserAvatar name={dueno.nombre} seed={dueno.avatar_seed} src={dueno.avatar_url} size="sm" />
              <span className="min-w-0 flex-1 truncate">{dueno.nombre}</span>
              <span className="text-xs text-muted-foreground">{t("drive.compartir.dueno")}</span>
            </div>
          )}
          {lista.map((c) => {
            const p = porId.get(c.user_id);
            return (
              <div key={c.user_id} className="flex items-center gap-2 py-1.5 text-sm">
                <UserAvatar name={p?.nombre ?? "?"} seed={p?.avatar_seed} src={p?.avatar_url} size="sm" />
                <span className="min-w-0 flex-1 truncate">{p?.nombre ?? c.user_id}</span>
                <Select
                  value={c.rol}
                  onValueChange={(v) => {
                    if (v === "__quitar") {
                      compartir.mutate({ itemId: item.id, userId: c.user_id, quitar: true }, { onError: alFallar });
                    } else {
                      compartir.mutate({ itemId: item.id, userId: c.user_id, rol: v as "lector" | "editor" }, { onError: alFallar });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lector">{t("drive.compartir.lector")}</SelectItem>
                    <SelectItem value="editor">{t("drive.compartir.editor")}</SelectItem>
                    <SelectItem value="__quitar">{t("drive.compartir.quitar")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
