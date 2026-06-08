import { useEffect, useRef, useState } from "react";
import { Check, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import type { PromologEntry } from "./PromologEntryCard";

// ── Form ÚNICO de Registrar/Editar Promoción ──────────────────────────────
// Antes había dos modales casi-iguales (Agregar = multi-foto; Editar = foto
// única) que se desfasaban. Este componente los unifica: MISMOS campos + UI +
// multi-foto en ambos modos. Cada foto = 1 fila en promolog_entries (igual que
// el bot guarda 1 fila por story); el día queda "Sí" si alguna foto es Sí.
//
// EDIT reconcilia el día con las fotos del form SIN pisar los datos de la IA:
// solo toca los campos que el form maneja (promoted, evidence_url, network,
// platform, action_taken, notes, story_index/count). ai_reasoning, ai_confidence,
// apify_run_id, etc. quedan intactos en las filas existentes. Quitar una foto
// borra esa fila; agregar una inserta una nueva (con la fecha del día).

const networkOptions = [
  { value: "instagram", label: "Instagram", icon: InstagramIcon },
  { value: "tiktok", label: "TikTok", icon: TikTokIcon },
  { value: "x", label: "X", icon: XIcon },
  { value: "telegram", label: "Telegram", icon: TelegramIcon },
] as const;

const platformOptions = [
  { value: "onlyfans", label: "OnlyFans" },
  { value: "unlok", label: "Unlok" },
  { value: "otra", label: "Otra" },
] as const;

const strategyOptions = [
  { value: "incentivo_economico", label: "Incentivo económico" },
  { value: "llamada_motivacional", label: "Llamada motivacional" },
  { value: "mensaje_estrategico", label: "Mensaje estratégico" },
  { value: "recordatorio_amable", label: "Recordatorio amable" },
  { value: "otro", label: "Otro" },
];

type Photo = { id?: string; url: string; promoted: boolean };

interface CreatorLite {
  id: string;
  name: string;
  artistic_name?: string | null;
  profile_photo_url?: string | null;
  instagram_handle?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  /** add: la creadora elegida en el paso anterior. */
  creator?: CreatorLite | null;
  /** edit: el entry representativo del día. */
  entry?: PromologEntry | null;
  /** edit: todas las stories/filas del día (para precargar las fotos). */
  dayStories?: PromologEntry[];
  /** se llama tras guardar OK (el padre puede invalidar queries propias). */
  onSaved?: () => void;
}

// Plataforma guardada (texto libre) → value del selector + custom.
const toPlatformValue = (platform: string | null | undefined): { value: string; custom: string } => {
  const raw = (platform || "").toLowerCase().trim();
  if (raw === "onlyfans" || raw === "unlok") return { value: raw, custom: "" };
  if (raw && raw !== "ninguna") return { value: "otra", custom: platform ?? "" };
  return { value: "", custom: "" };
};

const cleanHandle = (h: string) => h.replace(/^@/, "").replace(/\/$/, "").split("/").pop();

const PromologEntryFormDialog = ({ open, onOpenChange, mode, creator, entry, dayStories, onSaved }: Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [result, setResult] = useState<"si" | "no">("si");
  const [network, setNetwork] = useState("");
  const [platform, setPlatform] = useState("");
  const [customPlatform, setCustomPlatform] = useState("");
  const [strategy, setStrategy] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // (Re)inicializar SOLO al abrir (open: false→true). No depende de entry/dayStories
  // para no resetear el form si el padre re-renderiza mientras está abierto.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && entry) {
      setResult(entry.result === "Sí" ? "si" : "no");
      setNetwork((entry.network || "").toLowerCase());
      const p = toPlatformValue(entry.platform);
      setPlatform(p.value);
      setCustomPlatform(p.custom);
      setStrategy(entry.action_taken ?? "");
      setNotes(entry.notes ?? "");
      const initial: Photo[] =
        dayStories && dayStories.length > 0
          ? dayStories.filter((s) => s.evidence_url).map((s) => ({ id: s.id, url: s.evidence_url as string, promoted: s.result === "Sí" }))
          : entry.evidence_url
          ? [{ id: entry.id, url: entry.evidence_url, promoted: entry.result === "Sí" }]
          : [];
      setPhotos(initial);
      setOriginalIds(initial.map((ph) => ph.id).filter(Boolean) as string[]);
    } else {
      setResult("si");
      setNetwork("");
      setPlatform("");
      setCustomPlatform("");
      setStrategy("");
      setNotes("");
      setPhotos([]);
      setOriginalIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const headerName = (mode === "add" ? creator?.artistic_name || creator?.name : entry?.name) || "—";
  const headerHandle = (mode === "add" ? creator?.instagram_handle : entry?.handle) || "";
  const headerPhoto = mode === "add" ? creator?.profile_photo_url : entry?.profile_photo_url;

  // Subida multi-foto (mismo bucket + signed URL durable que el resto de Promolog).
  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `promolog-manual/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("creator-files").upload(path, file, { contentType: file.type, upsert: true });
        if (upErr) throw upErr;
        const { data: signed, error: signErr } = await supabase.storage.from("creator-files").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signErr || !signed?.signedUrl) throw signErr ?? new Error("No se pudo firmar la URL");
        setPhotos((prev) => [...prev, { url: signed.signedUrl, promoted: true }]);
      }
    } catch (err) {
      toast({ title: "Error subiendo evidencia", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSave = async () => {
    const isSi = result === "si";
    if (isSi && (!network || !platform)) {
      toast({ title: "Campos requeridos", description: "Completá Red Social y Plataforma.", variant: "destructive" });
      return;
    }
    const platformValue = platform === "otra" ? customPlatform || "Otra" : platform;
    const shared = {
      network: isSi ? network : "n/a",
      platform: isSi ? platformValue : null,
      action_taken: isSi ? strategy || null : null,
      notes: notes || null,
    };
    const promotedFor = (p: boolean) => (isSi ? (p ? "true" : "false") : "false");
    setSaving(true);
    try {
      if (mode === "add") {
        if (!creator?.id) return;
        const base = { creator_id: creator.id, date: new Date().toISOString(), reviewed_by: user?.id, created_by: user?.id, ...shared };
        const rows =
          photos.length > 0
            ? photos.map((ph, i) => ({ ...base, promoted: promotedFor(ph.promoted), evidence_url: ph.url, story_index: i, story_count: photos.length }))
            : [{ ...base, promoted: isSi ? "true" : "false", evidence_url: null }];
        const { error } = await supabase.from("promolog_entries").insert(rows);
        if (error) throw error;
        toast({ title: "Promoción registrada", description: photos.length > 1 ? `${photos.length} fotos guardadas.` : "Entrada guardada." });
      } else {
        if (!entry) return;
        // Reconciliar el día con las fotos del form.
        const rawDate = entry.rawDate || dayStories?.find((s) => s.rawDate)?.rawDate || new Date().toISOString();
        const ops: any[] = [];
        const keptIds = new Set<string>();
        photos.forEach((ph, i) => {
          if (ph.id) {
            keptIds.add(ph.id);
            ops.push(supabase.from("promolog_entries").update({ ...shared, promoted: promotedFor(ph.promoted), evidence_url: ph.url, story_index: i, story_count: photos.length }).eq("id", ph.id));
          } else {
            ops.push(supabase.from("promolog_entries").insert({ creator_id: entry.creator_id, date: rawDate, reviewed_by: user?.id, created_by: user?.id, ...shared, promoted: promotedFor(ph.promoted), evidence_url: ph.url, story_index: i, story_count: photos.length }));
          }
        });
        if (photos.length === 0) {
          // Mantener una fila representando el día (sin evidencia).
          keptIds.add(entry.id);
          ops.push(supabase.from("promolog_entries").update({ ...shared, promoted: isSi ? "true" : "false", evidence_url: null }).eq("id", entry.id));
        }
        // Borrar las filas que mostramos como fotos y el user quitó.
        const toDelete = originalIds.filter((id) => !keptIds.has(id));
        if (toDelete.length) ops.push(supabase.from("promolog_entries").delete().in("id", toDelete));

        const results = await Promise.all(ops);
        const firstErr = results.find((r: any) => r?.error)?.error;
        if (firstErr) throw firstErr;
        toast({ title: "Promoción actualizada", description: `Cambios guardados${photos.length > 1 ? ` (${photos.length} fotos)` : ""}.` });
      }
      queryClient.invalidateQueries({ queryKey: ["promolog-entries"] });
      queryClient.invalidateQueries({ queryKey: ["promolog-calendar"] });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] !flex !flex-col gap-0 p-0 overflow-hidden">
        {/* Header fijo */}
        <div className="shrink-0 p-6 pb-4 space-y-4">
          <DialogHeader className="pr-8">
            <DialogTitle>{mode === "add" ? "Registrar Promoción" : "Editar Promoción"}</DialogTitle>
            <DialogDescription className="sr-only">{mode === "add" ? "Registrar una nueva promoción para esta creadora" : "Editar los detalles de la promoción"}</DialogDescription>
          </DialogHeader>
          <Card className="bg-muted">
            <CardContent className="p-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {headerPhoto ? <AvatarImage src={headerPhoto} alt={headerName} /> : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{headerName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{headerName}</span>
                {headerHandle && <span className="text-xs text-muted-foreground">@{cleanHandle(headerHandle)}</span>}
              </div>
            </CardContent>
          </Card>
          <div className="space-y-2">
            <span className="text-sm font-medium">¿Promocionó Hoy?</span>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setResult("si")} className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${result === "si" ? "bg-primary text-primary-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                <Check className="h-4 w-4" />Sí Promocionó
              </button>
              <button type="button" onClick={() => setResult("no")} className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${result === "no" ? "bg-secondary text-secondary-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                <X className="h-4 w-4" />No Promocionó
              </button>
            </div>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-4 py-4">
            {result === "si" && (
              <>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Red Social <span className="text-destructive">*</span></span>
                  <div className="grid grid-cols-4 gap-2">
                    {networkOptions.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = network === opt.value;
                      return (
                        <button key={opt.value} type="button" onClick={() => setNetwork(opt.value)} className={`flex flex-col items-center justify-center gap-1.5 rounded-md px-2 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                          <Icon className="h-5 w-5" />{opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Plataforma <span className="text-destructive">*</span></span>
                  <div className="grid grid-cols-3 gap-2">
                    {platformOptions.map((opt) => {
                      const isSelected = platform === opt.value;
                      return (
                        <button key={opt.value} type="button" onClick={() => { setPlatform(opt.value); if (opt.value !== "otra") setCustomPlatform(""); }} className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {platform === "otra" && (
                    <Input placeholder="Nombre de la plataforma..." value={customPlatform} onChange={(e) => setCustomPlatform(e.target.value)} />
                  )}
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">¿Qué se hizo para que promocione?</span>
                  <div className="grid grid-cols-2 gap-2">
                    {strategyOptions.map((opt) => {
                      const isSelected = strategy === opt.value;
                      return (
                        <button key={opt.value} type="button" onClick={() => setStrategy(opt.value)} className={`flex items-center justify-center rounded-md px-3 py-2.5 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <span className="text-sm font-medium">Notas</span>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={result === "no" ? "¿Por qué no se pudo hacer la promo?..." : "Agregar notas..."} className="min-h-[80px]" />
            </div>

            {/* Evidencia MULTI-foto: subís una o varias y marcás Sí/No por cada una. */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Evidencia (fotos)</span>
              <div className="border-2 border-dashed border-input rounded-md p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => fileRef.current?.click()}>
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">{uploading ? "Subiendo…" : "Subir una o varias fotos"}</span>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
              </div>
              {photos.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map((ph, i) => (
                      <div key={ph.id ?? `new-${i}`} className="relative overflow-hidden rounded-md border border-input">
                        <img src={ph.url} alt={`Evidencia ${i + 1}`} className="h-28 w-full object-cover" />
                        <button type="button" title="Quitar" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                          <X className="h-3.5 w-3.5" />
                        </button>
                        {result === "si" && (
                          <div className="absolute inset-x-0 bottom-0 flex">
                            <button type="button" onClick={() => setPhotos((prev) => prev.map((p, j) => (j === i ? { ...p, promoted: true } : p)))} className={`flex-1 py-1 text-[11px] font-semibold transition-colors ${ph.promoted ? "bg-emerald-600 text-white" : "bg-black/60 text-white/80 hover:bg-black/70"}`}>Sí</button>
                            <button type="button" onClick={() => setPhotos((prev) => prev.map((p, j) => (j === i ? { ...p, promoted: false } : p)))} className={`flex-1 py-1 text-[11px] font-semibold transition-colors ${!ph.promoted ? "bg-rose-600 text-white" : "bg-black/60 text-white/80 hover:bg-black/70"}`}>No</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {result === "si" && <p className="text-[11px] text-muted-foreground">Marcá Sí/No en cada foto. El día queda "Sí" si al menos una es Sí.</p>}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer fijo */}
        <div className="shrink-0 p-6 pt-4 border-t">
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={uploading || saving} onClick={handleSave}>{mode === "add" ? "Guardar Promoción" : "Guardar Cambios"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PromologEntryFormDialog;
