import { useRef, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  Image as ImageIcon,
  Play,
  Plus,
  Trash2,
  Loader2,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAddVaultItem,
  useDeleteVaultItem,
  useReorderVaultItems,
} from "@/hooks/useChatterEvaluator";
import type { ChatterVaultItem } from "./types";

const isStorageUrl = (url: string) =>
  url.includes(".supabase.co/storage/") ||
  url.includes("/storage/v1/object/public/");

interface Props {
  items: ChatterVaultItem[];
  profileId: string;
  profileKey: string;
  editable?: boolean;
}

const VaultThumb = ({
  item,
  onClick,
  onDelete,
  editable,
  dragHandleProps,
}: {
  item: ChatterVaultItem;
  onClick: () => void;
  onDelete?: () => void;
  editable?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [errored, setErrored] = useState(false);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border bg-muted transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-0 h-full w-full"
        title={item.name}
      >
        {errored ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-xs text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="truncate">URL rota</span>
          </div>
        ) : item.media_type === "video" ? (
          <>
            <video
              src={item.url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
              onError={() => setErrored(true)}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <Play className="h-8 w-8 text-white" />
            </div>
          </>
        ) : (
          <img
            src={item.url}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        )}
      </button>

      {editable && (
        <>
          <div
            {...dragHandleProps}
            className="absolute left-1 top-1 z-10 hidden cursor-grab rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing md:block"
            title="Arrastra para reordenar"
          >
            <GripVertical className="h-3 w-3" />
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="absolute right-1 top-1 z-10 rounded bg-destructive/90 p-1 text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
            title="Eliminar"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {item.name}
      </div>
    </div>
  );
};

export const VaultGallery = ({ items, profileId, profileKey, editable = false }: Props) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [orderedItems, setOrderedItems] = useState(items);
  const [confirmDelete, setConfirmDelete] = useState<ChatterVaultItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMut = useAddVaultItem();
  const delMut = useDeleteVaultItem();
  const reorderMut = useReorderVaultItems();

  // Keep local order in sync with server data (when items refetch)
  if (items !== orderedItems && items.length !== orderedItems.length) {
    setOrderedItems(items);
  }

  const open = openIndex !== null ? orderedItems[openIndex] : null;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let ok = 0, fail = 0;
    for (const file of Array.from(files)) {
      try {
        await addMut.mutateAsync({ profileId, profileKey, file });
        ok++;
      } catch (e) {
        fail++;
        toast.error(`Falló subir ${file.name}`, { description: (e as Error).message });
      }
    }
    if (ok > 0) toast.success(`${ok} archivo(s) subido(s)`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConfirmedDelete = async () => {
    if (!confirmDelete) return;
    try {
      await delMut.mutateAsync({ item: confirmDelete });
      setConfirmDelete(null);
      toast.success("Item eliminado");
    } catch (e) {
      toast.error("No se pudo eliminar", { description: (e as Error).message });
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const next = Array.from(orderedItems);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrderedItems(next);
    try {
      await reorderMut.mutateAsync({
        profileId,
        orderedIds: next.map((i) => i.id),
      });
    } catch (e) {
      toast.error("No se pudo reordenar", { description: (e as Error).message });
      setOrderedItems(items); // revert
    }
  };

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={addMut.isPending}
            size="sm"
            className="gap-2"
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Subir archivos
          </Button>
        </div>
      )}

      {orderedItems.length === 0 ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
            <p className="text-sm">Sin contenido en el vault todavía.</p>
          </div>
        </Card>
      ) : editable ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="vault" direction="horizontal" type="vault">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              >
                {orderedItems.map((item, i) => (
                  <Draggable key={item.id} draggableId={item.id} index={i}>
                    {(prov) => (
                      <div ref={prov.innerRef} {...prov.draggableProps}>
                        <VaultThumb
                          item={item}
                          onClick={() => setOpenIndex(i)}
                          onDelete={() => setConfirmDelete(item)}
                          editable
                          dragHandleProps={prov.dragHandleProps ?? undefined}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {orderedItems.map((item, i) => (
            <VaultThumb key={item.id} item={item} onClick={() => setOpenIndex(i)} />
          ))}
        </div>
      )}

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpenIndex(null)}>
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
          {open && (
            <div className="space-y-2">
              {open.media_type === "video" ? (
                <video
                  src={open.url}
                  controls
                  autoPlay
                  className="max-h-[85vh] w-full rounded-lg bg-black"
                />
              ) : (
                <img
                  src={open.url}
                  alt={open.name}
                  className="mx-auto max-h-[85vh] rounded-lg object-contain"
                />
              )}
              <div className="flex items-center justify-between rounded-md bg-background/80 px-3 py-2 text-xs backdrop-blur">
                <span className="truncate">{open.name}</span>
                <span className="ml-2 shrink-0 text-muted-foreground">
                  {isStorageUrl(open.url) ? "branch storage" : "host original"}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar item</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `¿Eliminar "${confirmDelete.name}" del vault? No se puede deshacer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmedDelete();
              }}
              disabled={delMut.isPending}
            >
              {delMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VaultGallery;
