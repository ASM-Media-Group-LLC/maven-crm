import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, Upload, Save, X, ImageIcon, Film, FileText, Check, ChevronsUpDown, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle, detectPlatformFromUrl } from "@/lib/handle-utils";
import { checkCreatorExists, checkExistingContact, checkDuplicateOnlyFans } from "@/lib/lead-validation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import FileUploadModal, { type UploadCategory, type UploadedFile } from "@/components/FileUploadModal";

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

const COUNTRY_CODES = [
  { code: "+57", label: "🇨🇴 Colombia +57" },
  { code: "+52", label: "🇲🇽 México +52" },
  { code: "+54", label: "🇦🇷 Argentina +54" },
  { code: "+34", label: "🇪🇸 España +34" },
  { code: "+56", label: "🇨🇱 Chile +56" },
  { code: "+51", label: "🇵🇪 Perú +51" },
  { code: "+598", label: "🇺🇾 Uruguay +598" },
  { code: "+55", label: "🇧🇷 Brasil +55" },
  { code: "+1", label: "🇺🇸 USA +1" },
];

interface FormData {
  nombre: string;
  categoria: string;
  compania: string;
  email: string;
  countryCode: string;
  phone: string;
  ciudad: string;
  plataforma: string;
  accountLink: string;
  onlyfansUrl: string;
  ticket: string;
  notas: string;
}

const defaultForm: FormData = {
  nombre: "",
  categoria: "",
  compania: "",
  email: "",
  countryCode: "+57",
  phone: "",
  ciudad: "",
  plataforma: "Instagram",
  accountLink: "",
  onlyfansUrl: "",
  ticket: "",
  notas: "",
};

const NuevoContactoForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creatorAlert, setCreatorAlert] = useState<{ name: string; id: string } | null>(null);
  const [existingContactData, setExistingContactData] = useState<{
    id: string; name: string; phone?: string; email?: string; agentName?: string; createdAt?: string;
  } | null>(null);
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);
  const [companies, setCompanies] = useState<string[]>(DEFAULT_COMPANIES);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; category: UploadCategory }>({ open: false, category: "piclink" });
  const [profilePhoto, setProfilePhoto] = useState<UploadedFile | null>(null);
  const [extraFiles, setExtraFiles] = useState<UploadedFile[]>([]);
  const tempId = useMemo(() => crypto.randomUUID(), []);

  const handleFilesUploaded = (files: UploadedFile[]) => {
    if (uploadModal.category === "piclink") {
      setProfilePhoto(files[0] || null);
    } else {
      setExtraFiles((prev) => [...prev, ...files]);
    }
  };

  const removeExtraFile = (index: number) => setExtraFiles((prev) => prev.filter((_, i) => i !== index));

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

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-detect platform when account link changes
      if (key === "accountLink" && typeof value === "string") {
        const detected = detectPlatformFromUrl(value);
        if (detected) {
          const platformMap: Record<string, string> = {
            instagram: "Instagram",
            tiktok: "TikTok",
            twitter: "Twitter/X",
            onlyfans: "OnlyFans",
          };
          next.plataforma = platformMap[detected] || next.plataforma;
        }
      }
      return next;
    });
    if (errors[key]) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio";
    if (!form.accountLink.trim()) e.accountLink = "El link de la cuenta es obligatorio";
    if (Object.keys(e).length > 0) {
      setErrors(e);
      toast({ title: "Revisa los campos marcados", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      // VALIDATION 1: Check if creator exists (status-aware)
      const creatorCheck = await checkCreatorExists(form.accountLink, form.onlyfansUrl);
      if (creatorCheck.exists && creatorCheck.isActive) {
        setCreatorAlert({ name: creatorCheck.creatorName!, id: creatorCheck.creatorId! });
        setIsSaving(false);
        return;
      }

      let recordType = "nuevo";

      if (creatorCheck.exists && !creatorCheck.isActive) {
        recordType = "reactivado";
        toast({
          title: "⚠️ Creadora inactiva detectada",
          description: `${creatorCheck.creatorName} tiene estado "${creatorCheck.creatorStatus}". Se registrará como contacto reactivado.`,
        });
      }

      // VALIDATION 2: Check existing contact by handle — show modal for update option
      const existingContact = await checkExistingContact(form.accountLink);
      if (existingContact.exists) {
        setExistingContactData({
          id: existingContact.contactId!,
          name: existingContact.contactName!,
          phone: existingContact.contactPhone,
          email: existingContact.contactEmail,
          agentName: existingContact.contactAgentName,
          createdAt: existingContact.contactCreatedAt,
        });
        setIsSaving(false);
        return;
      }

      // VALIDATION 3: Check duplicate OnlyFans URL
      if (form.onlyfansUrl?.trim()) {
        const ofCheck = await checkDuplicateOnlyFans(form.onlyfansUrl);
        if (ofCheck.existsInLeads || ofCheck.existsInContacts) {
          const where = ofCheck.existsInLeads ? "leads" : "contactos";
          const nameInfo = ofCheck.matchName ? ` para "${ofCheck.matchName}"` : "";
          toast({
            title: "❌ OnlyFans duplicado",
            description: `Esta URL ya está registrada en ${where}${nameInfo}. No se puede registrar.`,
            variant: "destructive",
          });
          setIsSaving(false);
          return;
        }
      }

      // Phone duplicate check — WARNING only, does NOT block
      const trimmedPhone = form.phone?.trim();
      if (trimmedPhone) {
        const fullPhone = `${form.countryCode}${trimmedPhone}`;
        const { data: phoneInContacts } = await supabase
          .from("closers_contacts")
          .select("id, name")
          .eq("phone", trimmedPhone)
          .maybeSingle();
        if (phoneInContacts) {
          toast({
            title: "⚠️ Teléfono ya registrado",
            description: `Este número ya está registrado para ${phoneInContacts.name}. El contacto se guardará de todos modos.`,
          });
        }
        const { data: phoneInCreators } = await supabase
          .from("creators")
          .select("id, name, phone")
          .eq("phone", fullPhone)
          .maybeSingle();
        if (phoneInCreators) {
          toast({
            title: "⚠️ Teléfono en creators",
            description: `Este número ya existe para la creadora ${phoneInCreators.name}. El contacto se guardará de todos modos.`,
          });
        }
      }

      const handle = normalizeHandle(form.accountLink.trim());
      const { error } = await supabase.from("closers_contacts").insert({
        name: form.nombre.trim(),
        handle,
        platform: form.plataforma,
        physical_appearance: form.categoria || null,
        company: form.compania || null,
        email: form.email || null,
        country_code: form.countryCode,
        phone: form.phone || null,
        city: form.ciudad || null,
        ticket_number: form.ticket || null,
        notes: form.notas || null,
        onlyfans_url: form.onlyfansUrl?.trim() || null,
        profile_picture_url: profilePhoto?.url || null,
        created_by: user?.id || "",
        status: "new",
        record_type: recordType,
      } as any);

      if (error) throw error;

      toast({ title: "Contacto guardado exitosamente" });
      navigate("/contactos");
    } catch (err: any) {
      toast({ title: "Error al guardar contacto", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateExistingContact = async () => {
    if (!existingContactData) return;
    setIsUpdatingContact(true);
    try {
      const updates: Record<string, any> = {};
      if (form.phone?.trim()) updates.phone = form.phone.trim();
      if (form.email?.trim()) updates.email = form.email.trim();
      if (form.notas?.trim()) updates.notes = form.notas.trim();
      if (form.countryCode) updates.country_code = form.countryCode;
      if (form.ciudad?.trim()) updates.city = form.ciudad.trim();
      if (form.onlyfansUrl?.trim()) updates.onlyfans_url = form.onlyfansUrl.trim();

      if (Object.keys(updates).length === 0) {
        toast({ title: "No hay datos nuevos para actualizar", variant: "destructive" });
        setIsUpdatingContact(false);
        return;
      }

      const { error } = await supabase
        .from("closers_contacts")
        .update(updates)
        .eq("id", existingContactData.id);

      if (error) throw error;

      toast({ title: "Contacto actualizado exitosamente" });
      setExistingContactData(null);
      navigate("/contactos");
    } catch (err: any) {
      toast({ title: "Error al actualizar", description: err.message, variant: "destructive" });
    } finally {
      setIsUpdatingContact(false);
    }
  };

  const handleCreateNewAnyway = async () => {
    setExistingContactData(null);
    // Re-run submit but skip the existing contact check
    setIsSaving(true);
    try {
      const handle = normalizeHandle(form.accountLink.trim());
      const { error } = await supabase.from("closers_contacts").insert({
        name: form.nombre.trim(),
        handle,
        platform: form.plataforma,
        physical_appearance: form.categoria || null,
        company: form.compania || null,
        email: form.email || null,
        country_code: form.countryCode,
        phone: form.phone || null,
        city: form.ciudad || null,
        ticket_number: form.ticket || null,
        notes: form.notas || null,
        onlyfans_url: form.onlyfansUrl?.trim() || null,
        profile_picture_url: profilePhoto?.url || null,
        created_by: user?.id || "",
        status: "new",
        record_type: "reactivado",
      } as any);
      if (error) throw error;
      toast({ title: "Contacto guardado exitosamente" });
      navigate("/contactos");
    } catch (err: any) {
      toast({ title: "Error al guardar contacto", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <nav className="text-sm text-muted-foreground mb-2">
          <button onClick={() => navigate("/contactos")} className="hover:text-foreground transition-colors">Contactos</button>
          <span className="mx-2">›</span>
          <span className="text-foreground font-medium">Nuevo Contacto</span>
        </nav>
        <button
          onClick={() => navigate("/contactos")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserPlus className="h-6 w-6" /> Nuevo Contacto
        </h1>
        <p className="text-sm text-muted-foreground">Agrega un nuevo contacto al directorio de Closers</p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6 rounded-lg border border-border p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre del Contacto *" error={errors.nombre}>
              <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre completo" className={errors.nombre ? "border-destructive" : ""} />
            </Field>
            <Field label="Categoría Física *" error={errors.categoria}>
              <Select value={form.categoria} onValueChange={(v) => set("categoria", v)}>
                <SelectTrigger className={errors.categoria ? "border-destructive" : ""}><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Compañía / Cuenta de Origen">
            <CompanySelector value={form.compania} onChange={(v) => set("compania", v)} companies={companies} onAddCompany={(name) => setCompanies((prev) => [...prev, name])} />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@ejemplo.com" />
            </Field>
            <Field label="Teléfono">
              <div className="flex gap-2">
                <Select value={form.countryCode} onValueChange={(v) => set("countryCode", v)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTRY_CODES.map((cc) => <SelectItem key={cc.code} value={cc.code}>{cc.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Número de teléfono" className="flex-1" />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Link de la Cuenta *" error={errors.accountLink}>
              <Input value={form.accountLink} onChange={(e) => set("accountLink", e.target.value)} placeholder="https://instagram.com/usuario" className={errors.accountLink ? "border-destructive" : ""} />
            </Field>
            <Field label="Plataforma">
              <Select value={form.plataforma} onValueChange={(v) => set("plataforma", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="OnlyFans URL (opcional)">
            <Input value={form.onlyfansUrl} onChange={(e) => set("onlyfansUrl", e.target.value)} placeholder="https://onlyfans.com/usuario" />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Ciudad">
              <Input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} placeholder="Ej: Bogotá, Medellín..." />
            </Field>
            <Field label="Número de Ticket">
              <Input value={form.ticket} onChange={(e) => set("ticket", e.target.value)} placeholder="Ej: CT586864" />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Notas adicionales sobre el contacto..." rows={4} />
          </Field>

          <div>
            <Label className="text-sm font-medium">Foto de Perfil</Label>
            <div className="flex items-center gap-4 mt-2">
              <Avatar className="h-16 w-16">
                {profilePhoto ? <AvatarImage src={profilePhoto.url} alt="Foto de perfil" /> : null}
                <AvatarFallback><UserPlus className="h-6 w-6 text-muted-foreground" /></AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setUploadModal({ open: true, category: "piclink" })}>
                  <Upload className="mr-2 h-4 w-4" /> Subir Foto
                </Button>
                {profilePhoto && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => setProfilePhoto(null)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Fotos y Videos Extras</Label>
                <p className="text-xs text-muted-foreground mt-1">Formatos: Imágenes y Videos. Máximo 20MB por archivo.</p>
              </div>
              <Button variant="outline" size="sm" type="button" onClick={() => setUploadModal({ open: true, category: "extras" })}>
                <Upload className="mr-2 h-4 w-4" /> Subir Archivos
              </Button>
            </div>
            {extraFiles.length > 0 && (
              <div className="space-y-2 mt-3">
                {extraFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(f.type)}
                      <span className="truncate">{f.name}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{formatSize(f.size)}</span>
                    </div>
                    <button type="button" onClick={() => removeExtraFile(i)} className="text-muted-foreground hover:text-destructive ml-2">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-border bg-background px-6 py-4 shrink-0">
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/contactos")}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" /> {isSaving ? "Guardando..." : "Guardar Contacto"}
          </Button>
        </div>
      </footer>

      <FileUploadModal open={uploadModal.open} onClose={() => setUploadModal((prev) => ({ ...prev, open: false }))} category={uploadModal.category} tempId={tempId} onFilesUploaded={handleFilesUploaded} />

      {/* Creator exists alert */}
      {creatorAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border border-border p-6 max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Creadora existente</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Esta creadora ya forma parte de la agencia: <strong>{creatorAlert.name}</strong>
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCreatorAlert(null)}>Cancelar</Button>
              <Button onClick={() => { navigate(`/creadoras/${creatorAlert.id}`); setCreatorAlert(null); }}>
                Ver perfil
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Existing contact dialog */}
      <Dialog open={!!existingContactData} onOpenChange={(open) => { if (!open) setExistingContactData(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Contacto existente
            </DialogTitle>
            <DialogDescription>
              Esta modelo ya está registrada como contacto. Puedes actualizar sus datos o crear un nuevo registro.
            </DialogDescription>
          </DialogHeader>
          {existingContactData && (
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-border p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Nombre:</span> <strong>{existingContactData.name}</strong></p>
                {existingContactData.agentName && (
                  <p><span className="text-muted-foreground">Registrado por:</span> {existingContactData.agentName}</p>
                )}
                {existingContactData.createdAt && (
                  <p><span className="text-muted-foreground">Fecha:</span> {new Date(existingContactData.createdAt).toLocaleDateString("es-CO")}</p>
                )}
                {existingContactData.phone && (
                  <p><span className="text-muted-foreground">Teléfono actual:</span> {existingContactData.phone}</p>
                )}
                {existingContactData.email && (
                  <p><span className="text-muted-foreground">Email actual:</span> {existingContactData.email}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleUpdateExistingContact} disabled={isUpdatingContact} className="w-full">
              {isUpdatingContact ? "Actualizando..." : "Actualizar contacto"}
            </Button>
            <Button variant="outline" onClick={handleCreateNewAnyway} disabled={isSaving} className="w-full">
              Crear nuevo registro
            </Button>
            <Button variant="ghost" onClick={() => setExistingContactData(null)} className="w-full">
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-sm font-medium ${error ? "text-destructive" : ""}`}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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

export default NuevoContactoForm;
