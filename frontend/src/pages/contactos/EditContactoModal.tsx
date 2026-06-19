import { useState, useMemo, useCallback } from "react";
import { Pencil, Upload, X, ImageIcon, Film, FileText, Save, Check, ChevronsUpDown, Plus } from "lucide-react";
import { normalizeHandle, detectPlatformFromUrl } from "@/lib/handle-utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CountryCodeSelect } from "@/components/ui/country-code-select";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import FileUploadModal, { type UploadCategory, type UploadedFile } from "@/components/FileUploadModal";
import type { Contacto } from "./ContactosContent";

const CATEGORIES = [
  { value: "A+", label: "A+ (Premium)" },
  { value: "A", label: "A (Alta)" },
  { value: "B+", label: "B+ (Media Alta)" },
  { value: "B", label: "B (Media)" },
  { value: "C", label: "C (Básica)" },
];

const DEFAULT_COMPANIES = [
  "Kash", "Alvaro Letshoot", "Blue App", "PicLink", "Pagomundo", "Exchange", "Unlok", "Trafix",
];
const PLATFORMS = ["Instagram", "TikTok", "Twitter/X", "OnlyFans", "Otra"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: Contacto | null;
}

const EditContactoModal = ({ open, onOpenChange, contacto }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [compania, setCompania] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+57");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [plataforma, setPlataforma] = useState("Instagram");
  const [accountLink, setAccountLink] = useState("");
  const [ticket, setTicket] = useState("");
  const [notas, setNotas] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<UploadedFile | null>(null);
  const [extraFiles, setExtraFiles] = useState<UploadedFile[]>([]);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; category: UploadCategory }>({ open: false, category: "piclink" });
  const [companies, setCompanies] = useState<string[]>(DEFAULT_COMPANIES);
  const [isSaving, setIsSaving] = useState(false);
  const tempId = useMemo(() => crypto.randomUUID(), []);

  const [lastId, setLastId] = useState<string | null>(null);
  if (contacto && contacto.id !== lastId) {
    setLastId(contacto.id);
    setNombre(contacto.nombre);
    setCategoria(contacto.categoria);
    setAccountLink(contacto.instagram || "");
    setCompania(contacto.company);
    setEmail(contacto.email);
    setCountryCode(contacto.country_code || "+57");
    setPhone(contacto.phone);
    setCity(contacto.city && contacto.city !== "No aplicable" ? contacto.city : "");
    setNotas(contacto.notes);
    setTicket(contacto.ticket || "");
    setPlataforma(contacto.platform || "Instagram");
    setProfilePhoto(contacto.profile_picture_url ? { url: contacto.profile_picture_url, name: "current", type: "image/jpeg", size: 0, category: "piclink" as const } : null);
    setExtraFiles([]);
  }

  const handleAccountLinkChange = useCallback((value: string) => {
    setAccountLink(value);
    const detected = detectPlatformFromUrl(value);
    if (detected) {
      const platformMap: Record<string, string> = {
        instagram: "Instagram",
        tiktok: "TikTok",
        twitter: "Twitter/X",
        onlyfans: "OnlyFans",
      };
      setPlataforma(platformMap[detected] || "Otra");
    }
  }, []);

  const handleFilesUploaded = (files: UploadedFile[]) => {
    if (uploadModal.category === "piclink") setProfilePhoto(files[0] || null);
    else setExtraFiles((prev) => [...prev, ...files]);
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-primary" />;
    if (type.startsWith("video/")) return <Film className="h-4 w-4 text-primary" />;
    return <FileText className="h-4 w-4 text-primary" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSave = async () => {
    const extractedHandle = normalizeHandle(accountLink);
    if (!nombre.trim() || !extractedHandle) {
      toast({ title: "Nombre y link de la cuenta son obligatorios", variant: "destructive" });
      return;
    }
    if (!contacto) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("closers_contacts")
        .update({
          name: nombre.trim(),
          handle: extractedHandle,
          platform: plataforma,
          physical_appearance: categoria || null,
          company: compania || null,
          email: email || null,
          country_code: countryCode,
          phone: phone || null,
          city: city.trim() || null,
          notes: notas || null,
          profile_picture_url: profilePhoto?.url || null,
          ticket_number: ticket || null,
        })
        .eq("id", contacto.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["closers_contacts"] });
      toast({ title: "Contacto actualizado exitosamente" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al actualizar", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!contacto) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" /> Editar Contacto
            </DialogTitle>
            <DialogDescription>Modifica los datos del contacto</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[60vh] pr-4">
            <div className="space-y-4 pb-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Nombre del Contacto *</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Categoría Física *</Label>
                  <Select value={categoria} onValueChange={setCategoria}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Compañía / Cuenta de Origen</Label>
                <CompanySelector value={compania} onChange={setCompania} companies={companies} onAddCompany={(name) => setCompanies((prev) => [...prev, name])} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Teléfono</Label>
                  <div className="flex gap-2">
                    <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Número de teléfono" className="flex-1" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Link de la Cuenta *</Label>
                  <Input value={accountLink} onChange={(e) => handleAccountLinkChange(e.target.value)} placeholder="https://instagram.com/usuario" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Plataforma</Label>
                  <Select value={plataforma} onValueChange={setPlataforma}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Ciudad</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej: Bogotá" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Número de Ticket</Label>
                  <Input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Ej: CT586864" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Notas</Label>
                <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas adicionales sobre el contacto..." rows={3} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Foto de Perfil</Label>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    {profilePhoto ? <AvatarImage src={profilePhoto.url} /> : null}
                    <AvatarFallback className="text-xs">{nombre.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm" type="button" onClick={() => setUploadModal({ open: true, category: "piclink" })}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Subir
                  </Button>
                  {profilePhoto && (
                    <Button variant="ghost" size="sm" type="button" onClick={() => setProfilePhoto(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Fotos y Videos Extras</Label>
                  <Button variant="outline" size="sm" type="button" onClick={() => setUploadModal({ open: true, category: "extras" })}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Subir
                  </Button>
                </div>
                {extraFiles.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {extraFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-border px-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {getFileIcon(f.type)}
                          <span className="truncate">{f.name}</span>
                          <span className="text-muted-foreground text-xs shrink-0">{formatSize(f.size)}</span>
                        </div>
                        <button type="button" onClick={() => setExtraFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive ml-2">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1.5 h-4 w-4" /> {isSaving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileUploadModal open={uploadModal.open} onClose={() => setUploadModal((prev) => ({ ...prev, open: false }))} category={uploadModal.category} tempId={tempId} onFilesUploaded={handleFilesUploaded} />
    </>
  );
};

interface CompanySelectorProps {
  value: string;
  onChange: (value: string) => void;
  companies: string[];
  onAddCompany: (name: string) => void;
}

function CompanySelector({ value, onChange, companies, onAddCompany }: CompanySelectorProps) {
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddCompany(trimmed);
    onChange(trimmed);
    setNewName("");
    setAddingNew(false);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAddingNew(false); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {value || <span className="text-muted-foreground">Seleccionar compañía</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        {addingNew ? (
          <div className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Nueva compañía</p>
            <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre de la compañía" onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAddingNew(false); setNewName(""); } }} />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleAdd} disabled={!newName.trim()}>Agregar</Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewName(""); }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Buscar compañía..." />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {companies.map((c) => (
                  <CommandItem key={c} value={c} onSelect={() => { onChange(c === value ? "" : c); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
                    {c}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem onSelect={() => setAddingNew(true)} className="text-muted-foreground">
                  <Plus className="mr-2 h-4 w-4" /> Agregar nueva compañía…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default EditContactoModal;
