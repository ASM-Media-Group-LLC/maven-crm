import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Crown, Loader2, Send, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import type { AdminDePlataforma } from "@/lib/plataforma";
import { correoValido } from "@/lib/plataforma/planes";
import { usePlataforma } from "./contexto";
import { Cargando, Chip, ErrorConReintento, Inicial, haceCuanto, useTextoDeError } from "./piezas";

// /plataforma/equipo — «EQUIPO DE MAVEN» (Equipo.tsx de Lumina): los admins de la
// plataforma. Solo el dueño agrega (como Grace: todo menos precios y cobros),
// reenvía la invitación o quita. El dueño no se puede quitar.

export default function EquipoMaven() {
  const { t } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const [agregar, setAgregar] = useState(false);
  const [quitar, setQuitar] = useState<AdminDePlataforma | null>(null);
  const admins = useQuery({ queryKey: ["plataforma", "equipo"], queryFn: () => p.datos.equipoMaven() });

  const reenviar = useMutation({
    mutationFn: (u: string) => p.datos.reenviarInvitacionAdmin(u),
    onSuccess: () => toast.success(t("plataforma.persona.reenviada")),
    onError: (e) => toast.error(textoError(e)),
  });
  const quitarM = useMutation({
    mutationFn: (u: string) => p.datos.quitarAdminPlataforma(u),
    onSuccess: () => { toast.success(t("plataforma.equipo.quitado")); setQuitar(null); qc.invalidateQueries({ queryKey: ["plataforma", "equipo"] }); },
    onError: (e) => toast.error(textoError(e)),
  });

  return (
    <Page>
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={<Users />}
        title={t("plataforma.equipo.titulo")}
        subtitle={t("plataforma.equipo.sub")}
        actions={<Button onClick={() => setAgregar(true)}><UserPlus className="mr-1.5 h-4 w-4" />{t("plataforma.equipo.agregar")}</Button>}
      />

      {admins.isLoading ? <Cargando /> : admins.error ? <ErrorConReintento error={admins.error} onReintentar={() => admins.refetch()} /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {admins.data!.map((a) => (
            <div key={a.user_id} className="vidrio flex flex-wrap items-center gap-3 p-4">
              <Inicial nombre={a.nombre} className="h-11 w-11 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{a.nombre}</span>
                  {a.nivel === "dueno"
                    ? <Chip tono="acento"><Crown className="h-3 w-3" />{t("plataforma.equipo.dueno")}</Chip>
                    : <Chip><ShieldCheck className="h-3 w-3" />{t("plataforma.equipo.admin")}</Chip>}
                  {a.estado === "invitada" && <Chip tono="alerta" punto>{t("plataforma.estado.invitada")}</Chip>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{a.correo} · {t("plataforma.equipo.ultimo", { cuando: haceCuanto(a.ultimo_ingreso, t) })}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{a.nivel === "dueno" ? t("plataforma.equipo.duenoDesc") : t("plataforma.equipo.adminDesc")}</div>
              </div>
              {a.nivel !== "dueno" && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => reenviar.mutate(a.user_id)} disabled={reenviar.isPending}>
                    <Send className="mr-1 h-3.5 w-3.5" />{t("plataforma.persona.reenviar")}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setQuitar(a)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />{t("plataforma.persona.quitar")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {agregar && <AgregarAdmin onClose={() => setAgregar(false)} />}
      {quitar && (
        <Dialog open onOpenChange={(v) => { if (!v) setQuitar(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("plataforma.persona.quitar")}</DialogTitle>
              <DialogDescription>{t("plataforma.equipo.quitarConfirma", { nombre: quitar.nombre })}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setQuitar(null)}>{t("plataforma.cancelar")}</Button>
              <Button variant="destructive" onClick={() => quitarM.mutate(quitar.user_id)} disabled={quitarM.isPending}>{t("plataforma.persona.siQuitar")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
    </Page>
  );
}

function AgregarAdmin({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const crear = useMutation({
    mutationFn: () => p.datos.agregarAdminPlataforma(nombre, correo),
    onSuccess: (a) => { toast.success(t("plataforma.persona.creada", { correo: a.correo })); qc.invalidateQueries({ queryKey: ["plataforma", "equipo"] }); onClose(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const valido = nombre.trim().length >= 2 && correoValido(correo);
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !crear.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plataforma.equipo.agregar")}</DialogTitle>
          <DialogDescription>{t("plataforma.equipo.agregarSub")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5"><Label htmlFor="ea-n">{t("plataforma.campo.nombre")}</Label><Input id="ea-n" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="ea-c">{t("plataforma.campo.correo")}</Label><Input id="ea-c" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{t("plataforma.cancelar")}</Button>
            <Button onClick={() => crear.mutate()} disabled={!valido || crear.isPending}>
              {crear.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}{t("plataforma.equipo.invitar")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
