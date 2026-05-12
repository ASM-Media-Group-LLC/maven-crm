import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, Upload, Save, X, ImageIcon, Film, FileText, Check, ChevronsUpDown, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle, detectPlatformFromUrl } from "@/lib/handle-utils";
import { enqueueAvatarFetch } from "@/lib/avatarFetch";
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
import { PhoneInput } from "@/components/ui/phone-input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useScouterCompanies } from "@/hooks/useScouterLeads";
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
  // Lead seleccionado del autocomplete (de leadgen_entries). Si está
  // presente, al submit guardamos closers_contacts.leadgen_entry_id = id
  // — la attribution del LLG original se hace via JOIN a leadgen_entries.
  const [selectedLead, setSelectedLead] = useState<{
    id: string;
    model_handle: string | null;
    ticket_number: string | null;
    phone_raw: string | null;
    phone_e164: string | null;
    country_code: string | null;
    city: string | null;
    company: string | null;
    platform: string | null;
    onlyfans_url: string | null;
    notes: string | null;
    lg_user_id: string | null;
    llgName?: string | null; // resolved via profiles JOIN abajo
  } | null>(null);
  // Compañías canónicas — fuente única scouter_companies, lista fija.
  // DEFAULT_COMPANIES queda solo como fallback durante loading.
  const { data: scouterCompanies = [] } = useScouterCompanies();
  const companies = scouterCompanies.length > 0
    ? scouterCompanies.map((sc) => sc.name)
    : DEFAULT_COMPANIES;
  const setCompanies = (_: any) => {}; // no-op — la lista la maneja scouter_companies
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
    // Regla nueva: el contacto debe venir de un lead existente —
    // mantiene el flujo unificado LeadGen → Contactos. Si no aparece
    // en el autocomplete, el LLG debe crear primero el lead en
    // LeadGen y volver acá.
    if (!selectedLead) {
      e.nombre = "Tenés que seleccionar un lead existente. Si no aparece, andá a LeadGen y agregalo primero.";
    }
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
        company_id: scouterCompanies.find((sc) => sc.name === form.compania)?.id ?? null,
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
        // Si el contacto vino de un lead via autocomplete, guardamos la
        // referencia. El LLG que logueó el lead se lee via JOIN a
        // leadgen_entries.lg_user_id (no denormalizado acá).
        leadgen_entry_id: selectedLead?.id ?? null,
      } as any);

      if (error) throw error;

      // Si vino de un lead, marcamos el lead como 'contactado' — espejo
      // de lo que hace ConvertLeadModal cuando el flow es desde LeadGen.
      if (selectedLead?.id) {
        await supabase
          .from("leadgen_entries")
          .update({ status: "contactado" } as any)
          .eq("id", selectedLead.id);
      }

      // Avatar fetch async — el worker baja foto IG y la pone en
      // models.avatar_url (idempotente). No bloqueamos el submit.
      if (handle) void enqueueAvatarFetch(handle);

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
        company_id: scouterCompanies.find((sc) => sc.name === form.compania)?.id ?? null,
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
        leadgen_entry_id: selectedLead?.id ?? null,
      } as any);
      if (error) throw error;
      if (selectedLead?.id) {
        await supabase
          .from("leadgen_entries")
          .update({ status: "contactado" } as any)
          .eq("id", selectedLead.id);
      }
      if (handle) void enqueueAvatarFetch(handle);
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
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
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
              <LeadAutocomplete
                value={form.nombre}
                onTypedChange={(v) => set("nombre", v)}
                selectedLead={selectedLead}
                onLeadSelect={(lead) => {
                  setSelectedLead(lead);
                  if (!lead) return;
                  // Auto-fill todos los campos que vienen del lead. El
                  // user puede seguir editando — esto es un atajo, no un
                  // lock. El campo "nombre" queda con el handle del lead
                  // como mejor inferencia inicial.
                  setForm((prev) => ({
                    ...prev,
                    nombre: lead.model_handle ?? prev.nombre,
                    accountLink:
                      lead.model_handle && lead.platform?.toLowerCase() === "instagram"
                        ? `https://instagram.com/${lead.model_handle.replace(/^@/, "")}`
                        : prev.accountLink,
                    phone: lead.phone_raw || prev.phone,
                    countryCode: lead.country_code
                      ? lead.country_code.startsWith("+")
                        ? lead.country_code
                        : `+${lead.country_code}`
                      : prev.countryCode,
                    ciudad: lead.city ?? prev.ciudad,
                    ticket: lead.ticket_number ?? prev.ticket,
                    compania: lead.company ?? prev.compania,
                    plataforma: lead.platform ?? prev.plataforma,
                    onlyfansUrl: lead.onlyfans_url ?? prev.onlyfansUrl,
                    notas: lead.notes ?? prev.notas,
                  }));
                }}
                error={!!errors.nombre}
              />
              {selectedLead && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Desde lead{" "}
                  <code className="rounded bg-muted/40 px-1 py-0.5">
                    {selectedLead.ticket_number || `#${selectedLead.id.slice(0, 6)}`}
                  </code>
                  {selectedLead.llgName && ` · logueado por ${selectedLead.llgName}`}
                </p>
              )}
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
              <PhoneInput
                value={`${form.countryCode} ${form.phone}`.trim()}
                onChange={(val) => {
                  // Parse combined value back into countryCode + phone
                  const parts = val.match(/^(\+\d+)\s*(.*)/);
                  if (parts) {
                    set("countryCode", parts[1]);
                    set("phone", parts[2]);
                  } else {
                    set("phone", val);
                  }
                }}
              />
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
                  <div key={i} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
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
          <Button onClick={handleSubmit} disabled={isSaving || !selectedLead}>
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
              <div className="rounded-xl border border-border p-3 space-y-1 text-sm">
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
            {/* "Crear nuevo registro" solo disponible si el duplicado
                NO tiene teléfono — la regla es que un handle con tel
                ya registrado no se vuelve a meter. */}
            {!existingContactData?.phone && (
              <Button variant="outline" onClick={handleCreateNewAnyway} disabled={isSaving} className="w-full">
                Crear nuevo registro
              </Button>
            )}
            {existingContactData?.phone && (
              <p className="text-xs text-muted-foreground text-center px-2">
                Este handle ya tiene un teléfono registrado. No se permite duplicar.
              </p>
            )}
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

// ─── LeadAutocomplete ─────────────────────────────────────────────────
// Buscable. El user puede:
//   1. Tipear libremente (modo manual) — onTypedChange dispara, sin lead.
//   2. Tipear y ver dropdown con leads de leadgen_entries que matcheen
//      por model_handle/ticket_number/notes (server-side search).
//   3. Seleccionar uno → onLeadSelect dispara con la row completa →
//      el form padre autollena nombre/phone/ticket/compania/etc.
//
// El JOIN a profiles trae el nombre del LLG que logueó el lead, para
// mostrarlo abajo del nombre seleccionado ("logueado por Juan Pérez").
interface LeadAutocompleteLead {
  id: string;
  model_handle: string | null;
  ticket_number: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  country_code: string | null;
  city: string | null;
  company: string | null;
  platform: string | null;
  onlyfans_url: string | null;
  notes: string | null;
  lg_user_id: string | null;
  llgName?: string | null;
}

interface LeadAutocompleteProps {
  value: string;
  onTypedChange: (v: string) => void;
  selectedLead: LeadAutocompleteLead | null;
  onLeadSelect: (lead: LeadAutocompleteLead | null) => void;
  error?: boolean;
}

function LeadAutocomplete({ value, onTypedChange, selectedLead, onLeadSelect, error }: LeadAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Sync query a value cuando se abre — así si ya escribió algo en el
  // input, se muestra como término de búsqueda en el dropdown.
  useEffect(() => {
    if (open) setQuery(value || "");
  }, [open, value]);

  // Búsqueda fuzzy via RPC. Aguanta typos ("paola" encuentra "paula"
  // con similarity 0.5+) y busca en handle/ticket/notes/phone con
  // pg_trgm. Mejor que ILIKE para errores de tipeo del LLG.
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leadgen-search-fuzzy", query],
    queryFn: async () => {
      const q = query.trim();
      if (q.length < 2) return [];
      const { data, error: err } = await (supabase as any).rpc("leadgen_search_fuzzy", {
        p_query: q,
        p_limit: 20,
        p_min_similarity: 0.2,
      });
      if (err) throw err;
      const rows = (data ?? []) as LeadAutocompleteLead[];

      // Enriquecer con nombre del LLG que logueó cada lead — un solo
      // query por batch.
      const userIds = Array.from(
        new Set(rows.map((r) => r.lg_user_id).filter(Boolean) as string[]),
      );
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        const nameById = new Map<string, string>();
        for (const p of profs ?? []) nameById.set(p.id as string, (p as any).full_name);
        for (const r of rows) {
          if (r.lg_user_id) r.llgName = nameById.get(r.lg_user_id) ?? null;
        }
      }
      return rows;
    },
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              value={value}
              onChange={(e) => {
                onTypedChange(e.target.value);
                // Si el user edita después de seleccionar, deshacemos
                // la asociación al lead (deja de venir "desde lead X").
                if (selectedLead) onLeadSelect(null);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Nombre completo (o buscá un lead existente)"
              className={cn(error && "border-destructive", "pr-8")}
            />
            {selectedLead && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLeadSelect(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted/60"
                title="Quitar asociación al lead"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar lead por handle, ticket o notas…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {query.trim().length < 2 ? (
                <CommandEmpty>Escribí al menos 2 caracteres para buscar.</CommandEmpty>
              ) : isLoading ? (
                <CommandEmpty>Buscando…</CommandEmpty>
              ) : leads.length === 0 ? (
                <CommandEmpty>Sin leads que matcheen. Podés tipear el nombre manualmente.</CommandEmpty>
              ) : (
                <CommandGroup heading="Leads existentes">
                  {leads.map((lead) => (
                    <CommandItem
                      key={lead.id}
                      value={lead.id}
                      onSelect={() => {
                        onLeadSelect(lead);
                        setOpen(false);
                      }}
                      className="flex flex-col items-start gap-0.5 py-2"
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="font-medium truncate">
                          @{lead.model_handle ?? "?"}
                        </span>
                        {lead.ticket_number && (
                          <code className="text-[10px] text-muted-foreground bg-muted/40 px-1 py-0.5 rounded">
                            {lead.ticket_number}
                          </code>
                        )}
                        {lead.phone_raw && (
                          <span className="text-[10px] text-emerald-500 font-bold ml-auto shrink-0">
                            📞 ya tiene tel
                          </span>
                        )}
                      </div>
                      <div className="flex w-full items-center gap-2 text-[10px] text-muted-foreground">
                        {lead.company && <span>{lead.company}</span>}
                        {lead.city && <span>· {lead.city}</span>}
                        {lead.llgName && <span>· LLG: {lead.llgName}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default NuevoContactoForm;
