import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquareText, Plus, Pencil, Trash2, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Frases hechas INDIVIDUALES por usuario y por SECCIÓN (surface) de Maven. Cada usuario ve/edita
// solo las suyas (RLS user_id=auth.uid()) y cada superficie las propias ('chatter'|'inbox'|'messenger'):
// crear/borrar en una sección NO afecta a las otras. send_on_click=true → al click se manda solo;
// false → queda en el cajón (la decisión la aplica el composer vía onUse).
export interface ChatterScript {
  id: string;
  label: string | null;
  text: string;
  send_on_click: boolean;
  sort_order: number;
  created_at: string;
}

export function useChatterScripts(surface: string) {
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ["chatter-scripts", surface],
    staleTime: 60_000,
    queryFn: async (): Promise<ChatterScript[]> => {
      const { data, error } = await (supabase as any)
        .from("chatter_scripts")
        .select("id, label, text, send_on_click, sort_order, created_at")
        .eq("surface", surface)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        if (error.code === "42501") return [];
        throw error;
      }
      return (data ?? []) as ChatterScript[];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["chatter-scripts", surface] });

  const add = useMutation({
    mutationFn: async (v: { text: string; label?: string | null; send_on_click: boolean }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await (supabase as any).from("chatter_scripts").insert({
        text: v.text.trim(),
        label: v.label?.trim() || null,
        send_on_click: v.send_on_click,
        surface,
        user_id: uid,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; text: string; label?: string | null; send_on_click: boolean }) => {
      const { error } = await (supabase as any)
        .from("chatter_scripts")
        .update({ text: v.text.trim(), label: v.label?.trim() || null, send_on_click: v.send_on_click, updated_at: new Date().toISOString() })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("chatter_scripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { scripts: listQ.data ?? [], isLoading: listQ.isLoading, add, update, remove };
}

interface ScriptsButtonProps {
  /** Sección de Maven dueña de estas frases ('chatter' | 'inbox' | 'messenger'). Cada una es independiente. */
  surface: string;
  /** Usar una frase. El composer decide: si send_on_click la manda, si no la inserta en el cajón. */
  onUse: (script: ChatterScript) => void;
  disabled?: boolean;
}

type EditState = { id: string | null; text: string; label: string; sendOnClick: boolean } | null;

export function ScriptsButton({ surface, onUse, disabled }: ScriptsButtonProps) {
  const { scripts, isLoading, add, update, remove } = useChatterScripts(surface);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<EditState>(null); // null=no form, id=null=nuevo, id=set=editando

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return scripts;
    return scripts.filter(
      (s) => s.text.toLowerCase().includes(needle) || (s.label ?? "").toLowerCase().includes(needle),
    );
  }, [scripts, q]);

  const startNew = () => setEdit({ id: null, text: "", label: "", sendOnClick: false });
  const startEdit = (s: ChatterScript) => setEdit({ id: s.id, text: s.text, label: s.label ?? "", sendOnClick: s.send_on_click });

  const saveEdit = () => {
    if (!edit || !edit.text.trim()) return;
    const payload = { text: edit.text, label: edit.label, send_on_click: edit.sendOnClick };
    const m = edit.id
      ? update.mutate({ id: edit.id, ...payload }, { onSuccess: () => setEdit(null), onError: (e) => toast.error("No se pudo guardar", { description: (e as Error).message }) })
      : add.mutate(payload, { onSuccess: () => setEdit(null), onError: (e) => toast.error("No se pudo guardar", { description: (e as Error).message }) });
    return m;
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEdit(null); setQ(""); } }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs text-muted-foreground" disabled={disabled} title="Scripts (frases hechas)">
          <MessageSquareText className="h-4 w-4" /> Scripts
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-2">
        {edit ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold">{edit.id ? "Editar frase" : "Nueva frase"}</div>
            <Input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Nombre (opcional, para buscar)" className="h-8 text-sm" />
            <Textarea value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} placeholder="La frase…" rows={3} className="resize-none text-sm" autoFocus />
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={edit.sendOnClick} onChange={(e) => setEdit({ ...edit, sendOnClick: e.target.checked })} className="accent-primary" />
              Enviar al instante al hacer click <span className="text-muted-foreground">(si no, queda en el cajón para editar)</span>
            </label>
            <div className="flex justify-end gap-1 pt-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button size="sm" className="h-8 text-xs" disabled={!edit.text.trim() || add.isPending || update.isPending} onClick={saveEdit}>
                {(add.isPending || update.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar frase…" className="h-8 text-sm" />
              <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 px-2 text-xs" onClick={startNew}>
                <Plus className="h-3.5 w-3.5" /> Nueva
              </Button>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {scripts.length === 0 ? "Sin frases todavía. Crea una con “Nueva”." : "Nada coincide."}
                </p>
              ) : (
                filtered.map((s) => (
                  <div key={s.id} className="group flex items-start gap-1 rounded-md border border-border p-1.5 hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => { onUse(s); setOpen(false); }}
                      className="min-w-0 flex-1 text-left"
                      title={s.send_on_click ? "Click = enviar" : "Click = poner en el cajón"}
                    >
                      {s.label && <div className="truncate text-[11px] font-semibold text-foreground">{s.label}</div>}
                      <div className="line-clamp-2 text-xs text-muted-foreground">{s.text}</div>
                      <span className={`mt-0.5 inline-flex items-center gap-0.5 text-[9px] ${s.send_on_click ? "text-amber-500" : "text-muted-foreground/70"}`}>
                        {s.send_on_click ? <><Zap className="h-2.5 w-2.5" /> envía al click</> : <>↳ va al cajón</>}
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button type="button" onClick={() => startEdit(s)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Editar"><Pencil className="h-3 w-3" /></button>
                      <button type="button" onClick={() => remove.mutate(s.id, { onError: (e) => toast.error("No se pudo borrar", { description: (e as Error).message }) })} className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive" title="Borrar"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default ScriptsButton;
