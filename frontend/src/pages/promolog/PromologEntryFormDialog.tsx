import { useEffect, useRef, useState } from "react";
import { Check, X, Upload, Facebook, Youtube, Link as LinkIcon, ExternalLink } from "lucide-react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { buildSocialUrl } from "@/lib/utils";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import type { PromologEntry } from "./PromologEntryCard";

// ── Form de Registrar/Editar Promoción ────────────────────────────────────────
// AGREGAR (add): el operario puede marcar VARIAS redes; por cada red marca si la
// modelo promocionó (Sí/No) y sube la evidencia (fotos) de ESA red. Una entry =
// 1 modelo + 1 día: si vuelven a "Agregar Promo" para la misma modelo ese día con
// otra red, las filas nuevas se SUMAN al día existente (se agrupan por modelo+día
// en el listado y en el detalle). Cada foto = 1 fila en promolog_entries.
//
// EDITAR (edit): mantiene el modelo previo (una red, veredicto por foto) para no
// pisar los datos de la IA de las entries del bot (per-story promoted, ai_reasoning).

const RedditGlyph = ({ className }: { className?: string }) => (
  <span className={`${className ?? ""} inline-flex items-center justify-center font-bold`}>R</span>
);

const networkOptions = [
  { value: "instagram", label: "Instagram", icon: InstagramIcon },
  { value: "tiktok", label: "TikTok", icon: TikTokIcon },
  { value: "x", label: "X", icon: XIcon },
  { value: "telegram", label: "Telegram", icon: TelegramIcon },
  { value: "reddit", label: "Reddit", icon: RedditGlyph },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "youtube", label: "YouTube", icon: Youtube },
  { value: "otra", label: "Otra", icon: LinkIcon },
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

  // Compartidos (ambos modos).
  const [platform, setPlatform] = useState("");
  const [customPlatform, setCustomPlatform] = useState("");
  const [strategy, setStrategy] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // EDIT (modelo previo: una red, veredicto por foto).
  const [result, setResult] = useState<"si" | "no">("si");
  const [network, setNetwork] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);

  // ADD (multi-red: por red su Sí/No + sus fotos).
  const [selectedNets, setSelectedNets] = useState<string[]>([]);
  const [netResult, setNetResult] = useState<Record<string, "si" | "no">>({});
  const [netPhotos, setNetPhotos] = useState<Record<string, Photo[]>>({});

  const fileRef = useRef<HTMLInputElement>(null);

  // (Re)inicializar SOLO al abrir (open: false→true).
  useEffect(() => {
    if (!open) return;
    setPlatform("");
    setCustomPlatform("");
    setStrategy("");
    setNotes("");
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
      setPhotos([]);
      setOriginalIds([]);
      setSelectedNets([]);
      setNetResult({});
      setNetPhotos({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const headerName = (mode === "add" ? creator?.artistic_name || creator?.name : entry?.name) || "—";
  const headerHandle = (mode === "add" ? creator?.instagram_handle : entry?.handle) || "";
  const headerPhoto = mode === "add" ? creator?.profile_photo_url : entry?.profile_photo_url;

  // Redes registradas de la modelo → chips con link a sus perfiles (debajo del nombre).
  const creatorId = mode === "add" ? creator?.id : entry?.creator_id;
  const { data: creatorSocials } = useQuery({
    queryKey: ["promolog-form-socials", creatorId],
    enabled: open && !!creatorId,
    queryFn: async () => {
      const { data } = await supabase
        .from("creators")
        .select("instagram_handle, facebook_handle, reddit_handle, twitter_handle, tiktok_handle, youtube_handle, telegram_handle, other_url")
        .eq("id", creatorId!)
        .maybeSingle();
      return data;
    },
  });
  const socialChips = creatorSocials
    ? [
        { label: "Instagram", icon: <InstagramIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("instagram", creatorSocials.instagram_handle) },
        { label: "Telegram", icon: <TelegramIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("telegram", creatorSocials.telegram_handle) },
        { label: "Facebook", icon: <Facebook className="h-3.5 w-3.5" />, url: buildSocialUrl("facebook", creatorSocials.facebook_handle) },
        { label: "Reddit", icon: <RedditGlyph className="h-3.5 w-3.5 text-[10px]" />, url: buildSocialUrl("reddit", creatorSocials.reddit_handle) },
        { label: "X", icon: <XIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("twitter", creatorSocials.twitter_handle) },
        { label: "TikTok", icon: <TikTokIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("tiktok", creatorSocials.tiktok_handle) },
        { label: "YouTube", icon: <Youtube className="h-3.5 w-3.5" />, url: buildSocialUrl("youtube", creatorSocials.youtube_handle) },
        { label: "Otra", icon: <ExternalLink className="h-3.5 w-3.5" />, url: creatorSocials.other_url || "" },
      ].filter((c) => c.url)
    : [];

  // Sube archivos al bucket y devuelve las signed URLs durables.
  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `promolog-manual/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("creator-files").upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage.from("creator-files").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("No se pudo firmar la URL");
      urls.push(signed.signedUrl);
    }
    return urls;
  };

  // EDIT: subida multi-foto a la lista única.
  const handleEditPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadFiles(files);
      setPhotos((prev) => [...prev, ...urls.map((url) => ({ url, promoted: true }))]);
    } catch (err) {
      toast({ title: "Error subiendo evidencia", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  // ADD: subida de evidencia a UNA red.
  const handleNetPhotos = async (net: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadFiles(files);
      setNetPhotos((prev) => ({ ...prev, [net]: [...(prev[net] || []), ...urls.map((url) => ({ url, promoted: true }))] }));
    } catch (err) {
      toast({ title: "Error subiendo evidencia", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  // ADD: alternar una red (selección múltiple).
  const toggleNet = (v: string) => {
    setSelectedNets((prev) => {
      if (prev.includes(v)) {
        setNetResult((r) => { const n = { ...r }; delete n[v]; return n; });
        setNetPhotos((p) => { const n = { ...p }; delete n[v]; return n; });
        return prev.filter((x) => x !== v);
      }
      setNetResult((r) => ({ ...r, [v]: "si" }));
      setNetPhotos((p) => ({ ...p, [v]: [] }));
      return [...prev, v];
    });
  };

  const platformValue = platform === "otra" ? customPlatform || "Otra" : platform;
  const addAnySi = selectedNets.some((n) => netResult[n] === "si");

  const handleSave = async () => {
    setSaving(true);
    try {
      if (mode === "add") {
        if (!creator?.id) return;
        if (selectedNets.length === 0) {
          toast({ title: "Elegí al menos una red", description: "Marcá las redes que revisaste.", variant: "destructive" });
          setSaving(false);
          return;
        }
        if (addAnySi && !platform) {
          toast({ title: "Falta la plataforma", description: "Elegí a dónde apunta la promo (OnlyFans, etc.).", variant: "destructive" });
          setSaving(false);
          return;
        }
        const base = { creator_id: creator.id, date: new Date().toISOString(), reviewed_by: user?.id, created_by: user?.id, notes: notes || null };
        const rows: any[] = [];
        for (const net of selectedNets) {
          const isSi = netResult[net] === "si";
          const ph = netPhotos[net] || [];
          const sharedNet = {
            ...base,
            network: net,
            platform: isSi ? platformValue : null,
            action_taken: isSi ? strategy || null : null,
          };
          if (ph.length > 0) {
            ph.forEach((p, i) => rows.push({ ...sharedNet, promoted: isSi ? "true" : "false", evidence_url: p.url, story_index: i, story_count: ph.length }));
          } else {
            rows.push({ ...sharedNet, promoted: isSi ? "true" : "false", evidence_url: null });
          }
        }
        const { error } = await supabase.from("promolog_entries").insert(rows);
        if (error) throw error;
        toast({ title: "Promoción registrada", description: `${selectedNets.length} ${selectedNets.length === 1 ? "red" : "redes"} guardada(s) para hoy.` });
      } else {
        if (!entry) return;
        const isSi = result === "si";
        if (isSi && (!network || !platform)) {
          toast({ title: "Campos requeridos", description: "Completá Red Social y Plataforma.", variant: "destructive" });
          setSaving(false);
          return;
        }
        const shared = {
          network: isSi ? network : "n/a",
          platform: isSi ? platformValue : null,
          action_taken: isSi ? strategy || null : null,
          notes: notes || null,
        };
        const promotedFor = (p: boolean) => (isSi ? (p ? "true" : "false") : "false");
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
          keptIds.add(entry.id);
          ops.push(supabase.from("promolog_entries").update({ ...shared, promoted: isSi ? "true" : "false", evidence_url: null }).eq("id", entry.id));
        }
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
      <DialogContent className="max-w-lg max-h-[85vh] !flex !flex-col gap-0 p-0 overflow-hidden">
        {/* Header fijo */}
        <div className="shrink-0 p-6 pb-4 space-y-4">
          <DialogHeader className="pr-8">
            <DialogTitle>{mode === "add" ? "Registrar Promoción" : "Editar Promoción"}</DialogTitle>
            <DialogDescription className="sr-only">{mode === "add" ? "Registrar una nueva promoción para esta creadora" : "Editar los detalles de la promoción"}</DialogDescription>
          </DialogHeader>
          <Card className="bg-muted">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {headerPhoto ? <AvatarImage src={headerPhoto} alt={headerName} /> : null}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{headerName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{headerName}</span>
                  {headerHandle && <span className="text-xs text-muted-foreground">@{cleanHandle(headerHandle)}</span>}
                </div>
              </div>
              {/* Chips de redes registradas de la modelo (con link a sus perfiles). */}
              {socialChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {socialChips.map((c) => (
                    <a
                      key={c.label}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Abrir ${c.label}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      {c.icon}
                      {c.label}
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {mode === "edit" && (
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
          )}
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-4 py-4">
            {mode === "add" ? (
              <>
                {/* Multi-select de redes */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">Redes Sociales <span className="text-destructive">*</span></span>
                  <p className="text-xs text-muted-foreground">Elegí una o varias. Por cada red marcás si promocionó y subís su evidencia.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {networkOptions.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = selectedNets.includes(opt.value);
                      return (
                        <button key={opt.value} type="button" onClick={() => toggleNet(opt.value)} className={`relative flex flex-col items-center justify-center gap-1.5 rounded-md px-2 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                          {isSelected && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-2.5 w-2.5" /></span>}
                          <Icon className="h-5 w-5" />{opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Una sección por red elegida: Sí/No + evidencia */}
                {networkOptions.filter((o) => selectedNets.includes(o.value)).map((opt) => {
                  const Icon = opt.icon;
                  const res = netResult[opt.value] || "si";
                  const ph = netPhotos[opt.value] || [];
                  return (
                    <Card key={opt.value} className="border-border/70">
                      <CardContent className="space-y-3 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4" />Evidencia {opt.label}</span>
                          <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px] font-semibold">
                            <button type="button" onClick={() => setNetResult((r) => ({ ...r, [opt.value]: "si" }))} className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${res === "si" ? "bg-emerald-500 text-white" : "bg-muted/50 text-muted-foreground hover:text-emerald-500"}`}><Check className="h-3 w-3" />Sí</button>
                            <button type="button" onClick={() => setNetResult((r) => ({ ...r, [opt.value]: "no" }))} className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${res === "no" ? "bg-red-500 text-white" : "bg-muted/50 text-muted-foreground hover:text-red-500"}`}><X className="h-3 w-3" />No</button>
                          </div>
                        </div>
                        <div className="border-2 border-dashed border-input rounded-md p-3 text-center cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => document.getElementById(`tg-file-${opt.value}`)?.click()}>
                          <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">{uploading ? "Subiendo…" : `Subir foto(s) de ${opt.label}`}</span>
                          <input id={`tg-file-${opt.value}`} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleNetPhotos(opt.value, e)} />
                        </div>
                        {ph.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {ph.map((p, i) => (
                              <div key={`${opt.value}-${i}`} className="relative overflow-hidden rounded-md border border-input">
                                <img src={p.url} alt={`Evidencia ${opt.label} ${i + 1}`} className="h-20 w-full object-cover" />
                                <button type="button" title="Quitar" onClick={() => setNetPhotos((prev) => ({ ...prev, [opt.value]: (prev[opt.value] || []).filter((_, j) => j !== i) }))} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><X className="h-3 w-3" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Compartidos (solo si alguna red es Sí) */}
                {addAnySi && (
                  <>
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Plataforma <span className="text-destructive">*</span></span>
                      <div className="grid grid-cols-3 gap-2">
                        {platformOptions.map((opt) => (
                          <button key={opt.value} type="button" onClick={() => { setPlatform(opt.value); if (opt.value !== "otra") setCustomPlatform(""); }} className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${platform === opt.value ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {platform === "otra" && <Input placeholder="Nombre de la plataforma..." value={customPlatform} onChange={(e) => setCustomPlatform(e.target.value)} />}
                    </div>
                    <div className="space-y-2">
                      <span className="text-sm font-medium">¿Qué se hizo para que promocione?</span>
                      <div className="grid grid-cols-2 gap-2">
                        {strategyOptions.map((opt) => (
                          <button key={opt.value} type="button" onClick={() => setStrategy(opt.value)} className={`flex items-center justify-center rounded-md px-3 py-2.5 text-xs font-medium transition-colors ${strategy === opt.value ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <span className="text-sm font-medium">Notas</span>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agregar notas..." className="min-h-[70px]" />
                </div>
              </>
            ) : (
              <>
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
                        {platformOptions.map((opt) => (
                          <button key={opt.value} type="button" onClick={() => { setPlatform(opt.value); if (opt.value !== "otra") setCustomPlatform(""); }} className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${platform === opt.value ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {platform === "otra" && <Input placeholder="Nombre de la plataforma..." value={customPlatform} onChange={(e) => setCustomPlatform(e.target.value)} />}
                    </div>
                    <div className="space-y-2">
                      <span className="text-sm font-medium">¿Qué se hizo para que promocione?</span>
                      <div className="grid grid-cols-2 gap-2">
                        {strategyOptions.map((opt) => (
                          <button key={opt.value} type="button" onClick={() => setStrategy(opt.value)} className={`flex items-center justify-center rounded-md px-3 py-2.5 text-xs font-medium transition-colors ${strategy === opt.value ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <span className="text-sm font-medium">Notas</span>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={result === "no" ? "¿Por qué no se pudo hacer la promo?..." : "Agregar notas..."} className="min-h-[80px]" />
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Evidencia (fotos)</span>
                  <div className="border-2 border-dashed border-input rounded-md p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">{uploading ? "Subiendo…" : "Subir una o varias fotos"}</span>
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEditPhotos} />
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
              </>
            )}
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
