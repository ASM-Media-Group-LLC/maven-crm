import { useState } from "react";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Plus, KeyRound, Loader2, Copy, Link2, PhoneOff, ArrowRight, Pencil, Pin, PinOff, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useMeetRooms, MeetRoom } from "@/hooks/useMeetRooms";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoleTier } from "@/hooks/useRoleTier";

// El link que se COMPARTE es /entrar/<código>, no /call/<sala>: esa página manda
// a la llamada a quien tiene cuenta en Maven y le pide entrada a quien no la
// tiene (sala de espera). Un link a /call/ directo dejaría al invitado externo
// mirando la pantalla de login.
function shareLink(room: MeetRoom) {
  return `${getPublicBaseUrl()}/entrar/${room.code}`;
}

// La llamada vive en /call/:roomName (VideoCallPage + livekit-token), igual que
// cualquier otra videollamada de Maven. Se abre en pestaña aparte para que quien
// está en la reunión pueda seguir usando el CRM sin cortar el audio.
function openCall(room: MeetRoom) {
  const params = new URLSearchParams();
  if (room.isHost) params.set("admin", "1");
  params.set("name", room.name);
  const url = `/call/${encodeURIComponent(room.livekit_room_name)}?${params.toString()}`;
  const target = `call-${room.livekit_room_name}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  window.open(url, target, "noopener");
}

export default function MeetPage() {
  const {
    myRooms, setMyRooms, loading,
    createRoom, renameRoom, setPinned, reorder, endRoom, refresh,
  } = useMeetRooms();
  const { t } = useLanguage();
  const [renameTarget, setRenameTarget] = useState<MeetRoom | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const { explicitPermission } = usePermissions();
  const [creating, setCreating] = useState(false);

  // Crear una reunión: supervisores y arriba (Alvaro, 17/11/2026; los chatters
  // no). Arriba de ese piso, un admin puede quitar el permiso por rol desde
  // Administración → Roles (misma regla que aplica la edge meet-room).
  const { isSupervisorOrAbove } = useRoleTier();
  const canCreate = isSupervisorOrAbove && (explicitPermission("Meet", "Crear reunión") ?? true);

  // El link que se comparte: para supervisores y arriba, el DIRECTO de invitado
  // (/unirse/…: escribe su nombre y entra, sin sala de espera). Para el resto,
  // /entrar/<código>: los de Maven entran y alguien de afuera tiene que esperar
  // a que un supervisor lo admita. Si pedir el directo falla, cae al de código.
  // Desde el 18/11/2026 (Alvaro): el de afuera SIEMPRE pide permiso y quien
  // llama lo deja pasar; el link directo (/unirse) ya no se reparte desde aquí.
  const linkParaCompartir = async (room: MeetRoom): Promise<string> => shareLink(room);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const room = await createRoom();
      openCall(room);
      await navigator.clipboard
        .writeText(await linkParaCompartir(room))
        .catch(() => { /* sin permiso de portapapeles: el link igual está en la lista */ });
      toast.success(t("meet.created", { code: room.code }), {
        description: t("meet.createdDesc"),
      });
    } catch (e: any) {
      toast.error(e.message || t("meet.createError"));
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (room: MeetRoom) => {
    await navigator.clipboard.writeText(await linkParaCompartir(room)).catch(() => {});
    toast.success(t("meet.linkCopied"));
  };

  const copyCode = (room: MeetRoom) => {
    navigator.clipboard.writeText(room.code);
    toast.success(t("meet.codeCopied", { code: room.code }));
  };

  const doRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await renameRoom(renameTarget.id, renameValue.trim());
      setRenameTarget(null);
      toast.success(t("meet.renamed"));
    } catch (e: any) {
      toast.error(e.message || t("meet.renameError"));
    } finally {
      setRenaming(false);
    }
  };

  const togglePin = async (room: MeetRoom) => {
    try {
      await setPinned(room.id, !room.pinned);
    } catch (e: any) {
      toast.error(e.message || t("meet.pinError"));
    }
  };

  // Se reordena en pantalla primero y se guarda después: arrastrar y ver el
  // ítem volver a su lugar mientras responde el servidor se siente roto.
  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...visibles];
    const [movida] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, movida);
    const todas = [...next, ...myRooms.filter((r) => !next.includes(r))];
    setMyRooms(todas);
    try {
      await reorder(todas.map((r) => r.id));
    } catch {
      toast.error(t("meet.orderError"));
    }
  };

  const handleEnd = async (room: MeetRoom) => {
    if (!window.confirm(t("meet.endConfirm", { name: room.name }))) return;
    try {
      await endRoom(room.id);
      toast.success(t("meet.ended"));
    } catch (e: any) {
      toast.error(e.message || t("meet.endError"));
    }
  };

  // SOLO LAS DE HOY (Alvaro, 18/11/2026): Meet es para llamar a gente de
  // afuera; la lista de 35 reuniones viejas sobraba. Las fijadas se quedan.
  const hoyBogota = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const esDeHoy = (r: MeetRoom) => !!r.created_at
    && new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) === hoyBogota;
  const visibles = myRooms.filter((r) => r.pinned || esDeHoy(r));


  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
    {/* Misma composición que la portada de Cowork (pedido de Jhon, 09/09/2026):
        tarjeta ancha con icono + título a la izquierda y la acción a la derecha,
        debajo la fila para entrar con link o código, y las reuniones abiertas
        como lista de tarjetas. Antes Meet era una tarjeta angosta y centrada,
        con todo apilado, y al lado de Cowork parecía otro producto. */}
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="w-full rounded-3xl bg-primary/5 px-5 py-6 md:px-8 md:py-7">
        <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:gap-5 md:text-left">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 md:h-12 md:w-12">
            <Video className="h-7 w-7 text-primary md:h-6 md:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Meet</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {visibles.length > 0
                ? t("meet.subtitleBack")
                : t("meet.subtitleNew")}
            </p>
          </div>
          {canCreate && (
            <Button
              onClick={handleCreate}
              disabled={creating}
              size="lg"
              className="w-full gap-2 rounded-full px-7 shadow-md md:w-auto"
            >
              {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              {t("meet.new")}
            </Button>
          )}
        </div>

      </div>

      {!loading && visibles.length > 0 && (
        <div className="w-full flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground px-1">
            {t("meet.openRooms", { n: visibles.length })}
          </h2>
          {/* Con muchas reuniones la lista scrollea sola en vez de estirar la
              página. Las fijadas van arriba (el orden lo pone el hook). */}
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="meet-rooms">
              {(dropProvided) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="flex flex-col gap-2 sm:max-h-[420px] sm:overflow-y-auto pr-1"
                >
                  {visibles.map((room, index) => (
                    <Draggable key={room.id} draggableId={room.id} index={index}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`flex flex-wrap items-center gap-3 bg-card border rounded-2xl px-4 py-3 ${
                            snapshot.isDragging ? "border-primary shadow-lg" : "border-border"
                          }`}
                        >
                          <span
                            {...dragProvided.dragHandleProps}
                            className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
                            title={t("meet.dragToReorder")}
                            aria-label={t("meet.reorder")}
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>

                          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 shrink-0">
                            <Video className="h-5 w-5 text-primary" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-foreground truncate">{room.name}</span>
                              {/* Solo el anfitrión puede renombrar: el nombre lo ven
                                  todos los que tienen la reunión en su lista. */}
                              {room.isHost && (
                                <button
                                  type="button"
                                  className="text-muted-foreground/40 hover:text-primary transition-colors shrink-0"
                                  title={t("meet.renameTitle")}
                                  aria-label={t("meet.renameAria")}
                                  onClick={() => { setRenameTarget(room); setRenameValue(room.name); }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => copyCode(room)}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                              title={t("meet.copyCode")}
                            >
                              <KeyRound className="h-3 w-3" />
                              <span className="font-mono tracking-[0.2em]">{room.code}</span>
                              <Copy className="h-2.5 w-2.5 opacity-60" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 w-full justify-end sm:w-auto">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 tactil:h-10 tactil:w-10 rounded-full ${room.pinned ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                            title={room.pinned ? t("meet.unpin") : t("meet.pin")}
                            aria-label={room.pinned ? t("meet.unpin") : t("meet.pin")}
                            onClick={() => togglePin(room)}
                          >
                            {room.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 tactil:h-10 tactil:w-10 rounded-full text-muted-foreground hover:text-primary"
                            title={t("meet.copyLink")}
                            aria-label={t("meet.copyLink")}
                            onClick={() => void copyLink(room)}
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          {/* Terminar la reunión es del anfitrión; el resto solo la
                              tiene en su lista. */}
                          {room.isHost && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 tactil:h-10 tactil:w-10 rounded-full text-destructive hover:text-destructive"
                              title={t("meet.end")}
                              aria-label={t("meet.end")}
                              onClick={() => handleEnd(room)}
                            >
                              <PhoneOff className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" className="rounded-full gap-1 shrink-0" onClick={() => openCall(room)}>
                            {t("meet.join")} <ArrowRight className="h-4 w-4" />
                          </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      <Dialog open={!!renameTarget} onOpenChange={(v) => { if (!v) setRenameTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("meet.nameTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="meet-room-name">{t("meet.nameLabel")}</Label>
            <Input
              id="meet-room-name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value.slice(0, 80))}
              onKeyDown={(e) => { if (e.key === "Enter" && renameValue.trim()) void doRename(); }}
              placeholder={t("meet.namePlaceholder")}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              {t("meet.nameHint")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => void doRename()} disabled={!renameValue.trim() || renaming}>
              {renaming ? t("meet.saving") : t("common.save")}

            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </div>
  );
}
