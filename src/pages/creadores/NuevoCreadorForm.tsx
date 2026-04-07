import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Pencil, Upload, X, Check,
  User, Phone, Share2, Image, Settings, FileText, DollarSign, StickyNote,
  ChevronLeft, ChevronRight, Plus, Trash2, Package,
} from "lucide-react";
import FileUploadModal, { type UploadCategory, type UploadedFile } from "@/components/FileUploadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAddCreadorWithBusiness } from "./useCreadores";
import CommissionTiersEditor, { type CommissionTier } from "@/components/commission/CommissionTiersEditor";

const AGENCIES = ["Atomic Agency", "Elite Models", "Kash Agency", "Unlok Platform", "Trafix", "ORA Agency", "Exchange", "Otra"];
const LANGUAGES = ["Español", "English", "Italiano", "Português", "Français", "Deutsch", "Русский"];
const STATUSES = [
  { value: "onboarding", label: "En Onboarding" },
  { value: "active", label: "Activa" },
  { value: "paused", label: "Pausada" },
  { value: "leaving", label: "En Retiro" },
  { value: "terminated", label: "Terminada" },
];
const CATEGORIES = [
  { value: "A+", label: "A+ (Premium)" },
  { value: "A", label: "A (Alta)" },
  { value: "B+", label: "B+ (Media Alta)" },
  { value: "B", label: "B (Media)" },
  { value: "C", label: "C (Básica)" },
];
const PAYMENT_METHODS = ["PayPal", "Crypto", "Zelle", "Pagomundo", "Directa24", "Paxom", "Cuenta Bancaria Colombia", "Cuenta Bancaria Estados Unidos", "Otro"];
const COUNTRIES = [
  "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Arabia Saudita", "Argelia", "Argentina",
  "Armenia", "Australia", "Austria", "Azerbaiyán", "Bahamas", "Bangladés", "Bélgica", "Belice",
  "Benín", "Bielorrusia", "Bolivia", "Bosnia y Herzegovina", "Brasil", "Bulgaria", "Cabo Verde",
  "Camboya", "Camerún", "Canadá", "Chile", "China", "Chipre", "Colombia", "Corea del Sur",
  "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Ecuador", "Egipto", "El Salvador", "Emiratos Árabes Unidos",
  "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Etiopía", "Filipinas", "Finlandia",
  "Francia", "Georgia", "Ghana", "Grecia", "Guatemala", "Guinea Ecuatorial", "Haití", "Honduras",
  "Hungría", "India", "Indonesia", "Irak", "Irán", "Irlanda", "Islandia", "Israel", "Italia",
  "Jamaica", "Japón", "Jordania", "Kazajistán", "Kenia", "Letonia", "Líbano", "Lituania",
  "Luxemburgo", "Malasia", "Marruecos", "México", "Moldavia", "Mónaco", "Montenegro", "Mozambique",
  "Nicaragua", "Nigeria", "Noruega", "Nueva Zelanda", "Países Bajos", "Pakistán", "Panamá",
  "Paraguay", "Perú", "Polonia", "Portugal", "Puerto Rico", "Reino Unido", "República Checa",
  "República Dominicana", "Rumania", "Rusia", "Serbia", "Singapur", "Sudáfrica", "Suecia",
  "Suiza", "Tailandia", "Taiwán", "Trinidad y Tobago", "Túnez", "Turquía", "Ucrania", "Uruguay",
  "Venezuela", "Vietnam", "Otro",
];

const AVAILABLE_PLATFORMS = ["Leak Hunter", "Blu", "PickLink", "ORA", "Lumina"];
const PLATFORM_FREQUENCIES = [
  { value: "mensual", label: "Mensual" },
  { value: "quincenal", label: "Quincenal" },
  { value: "semanal", label: "Semanal" },
  { value: "anual", label: "Anual" },
];

interface PlatformEntry {
  id: string;
  name: string;
  customName: string;
  amount: number;
  frequency: string;
}

interface FormData {
  assigned_agency: string;
  status: string;
  name: string;
  artistic_name: string;
  age: number;
  birth_date: string;
  country: string;
  city: string;
  languages: string[];
  email: string;
  phone: string;
  instagram_handle: string;
  twitter_handle: string;
  tiktok_handle: string;
  youtube_handle: string;
  linkedin_handle: string;
  onlyfans_url: string;
  profile_photo_url: string;
  bio: string;
  category: string;
  start_date: string;
  agency_percentage: number;
  commission_type: "fixed" | "tiered";
  commission_tiers: CommissionTier[];
  payment_method: string;
  billing_start_date: string;
  billing_frequency: string;
  billing_address: string;
  internal_notes: string;
  platforms: PlatformEntry[];
}

const defaultForm: FormData = {
  assigned_agency: "",
  status: "onboarding",
  name: "",
  artistic_name: "",
  age: 0,
  birth_date: "",
  country: "",
  city: "",
  languages: [],
  email: "",
  phone: "",
  instagram_handle: "",
  twitter_handle: "",
  tiktok_handle: "",
  youtube_handle: "",
  linkedin_handle: "",
  onlyfans_url: "",
  profile_photo_url: "",
  bio: "",
  category: "",
  start_date: "",
  agency_percentage: 15,
  commission_type: "fixed",
  commission_tiers: [],
  payment_method: "",
  billing_start_date: "",
  billing_frequency: "",
  billing_address: "",
  internal_notes: "",
  platforms: [],
};

const STEPS = [
  { id: 1, label: "Datos Personales", icon: User },
  { id: 2, label: "Contacto y Redes", icon: Share2 },
  { id: 3, label: "Operación", icon: Settings },
  { id: 4, label: "Plataformas Activas", icon: Package },
  { id: 5, label: "Condiciones Comerciales", icon: DollarSign },
];

const NuevoCreadorForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [step, setStep] = useState(1);
  const mutation = useAddCreadorWithBusiness();
  const tempId = useMemo(() => crypto.randomUUID(), []);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; category: UploadCategory }>({ open: false, category: "contracts" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openUpload = (category: UploadCategory) => setUploadModal({ open: true, category });
  const handleFilesUploaded = (files: UploadedFile[]) => setUploadedFiles((prev) => [...prev, ...files]);
  const removeUploadedFile = (url: string) => setUploadedFiles((prev) => prev.filter((f) => f.url !== url));
  const filesByCategory = (cat: UploadCategory) => uploadedFiles.filter((f) => f.category === cat);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const toggleLanguage = (lang: string) => {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
    if (errors.languages) setErrors((prev) => { const next = { ...prev }; delete next.languages; return next; });
  };

  // Platform helpers
  const addPlatform = () => {
    set("platforms", [...form.platforms, { id: crypto.randomUUID(), name: "", customName: "", amount: 0, frequency: "mensual" }]);
  };
  const updatePlatform = (id: string, field: keyof PlatformEntry, value: string | number) => {
    set("platforms", form.platforms.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };
  const removePlatform = (id: string) => {
    set("platforms", form.platforms.filter((p) => p.id !== id));
  };
  const usedPlatformNames = form.platforms.map((p) => p.name).filter((n) => n && n !== "Otra");

  const validateStep = useCallback((s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.assigned_agency) e.assigned_agency = "La agencia es obligatoria";
      if (!form.name.trim()) e.name = "El nombre es obligatorio";
      if (!form.age || form.age < 18) e.age = "La edad mínima es 18 años";
      if (!form.birth_date) e.birth_date = "La fecha de nacimiento es obligatoria";
      if (!form.country) e.country = "El país es obligatorio";
      if (!form.city.trim()) e.city = "La ciudad es obligatoria";
      if (form.languages.length === 0) e.languages = "Selecciona al menos un idioma";
    }
    if (s === 2) {
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "El email no es válido";
    }
    if (s === 5) {
      if (!form.payment_method) e.payment_method = "El método de pago es obligatorio";
    }
    return e;
  }, [form]);

  const goNext = () => {
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goPrev = () => setStep((s) => Math.max(s - 1, 1));

  const goToStep = (s: number) => {
    if (s < step) {
      setStep(s);
      return;
    }
    // Validate all steps up to current before jumping forward
    for (let i = step; i < s; i++) {
      const validationErrors = validateStep(i);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setStep(i);
        toast({ title: "Revisa los campos marcados", variant: "destructive" });
        return;
      }
    }
    setErrors({});
    setStep(s);
  };

  const handleSubmit = async () => {
    const validationErrors = validateStep(5);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toast({ title: "Revisa los campos marcados", variant: "destructive" });
      return;
    }

    try {
      const documents = uploadedFiles.map((f) => ({
        file_name: f.name,
        file_url: f.url,
        file_type: f.type,
        description: f.category,
      }));

      // Build platforms JSON for storage
      const platformsData = form.platforms
        .filter((p) => p.name)
        .map((p) => ({
          name: p.name === "Otra" ? p.customName : p.name,
          amount: p.amount,
          frequency: p.frequency,
        }));

      await mutation.mutateAsync({
        creator: {
          name: form.name,
          artistic_name: form.artistic_name || null,
          email: form.email || null,
          phone: form.phone || null,
          category: form.category || null,
          country: form.country || null,
          city: form.city || null,
          status: form.status || "onboarding",
          age: form.age || null,
          birth_date: form.birth_date || null,
          languages: form.languages.length > 0 ? form.languages : null,
          instagram_handle: form.instagram_handle || null,
          twitter_handle: form.twitter_handle || null,
          tiktok_handle: form.tiktok_handle || null,
          youtube_handle: form.youtube_handle || null,
          linkedin_handle: form.linkedin_handle || null,
          onlyfans_url: form.onlyfans_url || null,
          profile_photo_url: form.profile_photo_url || null,
          bio: form.bio || null,
          internal_notes: form.internal_notes || null,
        },
        business: {
          assigned_agency: form.assigned_agency || null,
          agency_percentage: form.commission_type === "fixed" ? (form.agency_percentage || null) : null,
          commission_type: form.commission_type,
          commission_tiers: form.commission_type === "tiered" ? (form.commission_tiers as any) : [],
          payment_method: form.payment_method || null,
          start_date: form.start_date || null,
          billing_start_date: form.billing_start_date || null,
          billing_frequency: form.billing_frequency || null,
          billing_address: form.billing_address || null,
        },
        documents,
      });
      toast({ title: "Creador guardado exitosamente" });
      navigate("/creadores");
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/creadores")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver a Creadores
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5" /> Nuevo Creador
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Completa los detalles del nuevo creador</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b bg-background px-6 py-3 space-y-3">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => goToStep(s.id)}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  step === s.id ? "text-foreground" : step > s.id ? "text-foreground/70" : "text-muted-foreground"
                )}
              >
                <span className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                  step === s.id
                    ? "border-transparent bg-gradient-to-r from-accent to-primary text-white ring-2 ring-accent/30"
                    : step > s.id
                    ? "border-transparent bg-gradient-to-r from-accent to-primary text-white"
                    : "border-muted-foreground/30 text-muted-foreground"
                )}>
                  {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn("h-px flex-1 mx-2 transition-colors", step > s.id ? "bg-gradient-to-r from-accent to-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>
        <Progress value={(step / STEPS.length) * 100} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {/* Step 1: Datos Personales */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" /> Datos Personales
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Agencia Asignada *" error={errors.assigned_agency} fieldKey="assigned_agency">
                  <Select value={form.assigned_agency} onValueChange={(v) => set("assigned_agency", v)}>
                    <SelectTrigger className={errors.assigned_agency ? "border-destructive" : ""}><SelectValue placeholder="Seleccionar agencia" /></SelectTrigger>
                    <SelectContent>
                      {AGENCIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Estado">
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Nombre Completo *" error={errors.name} fieldKey="name">
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nombre completo" className={errors.name ? "border-destructive" : ""} />
                </Field>
                <Field label="Nombre Artístico">
                  <Input value={form.artistic_name} onChange={(e) => set("artistic_name", e.target.value)} placeholder="Nombre artístico" />
                </Field>
                <Field label="Edad *" error={errors.age} fieldKey="age">
                  <Input type="number" value={form.age || ""} onChange={(e) => set("age", Number(e.target.value))} min={18} className={errors.age ? "border-destructive" : ""} />
                </Field>
                <Field label="Fecha de Nacimiento *" error={errors.birth_date} fieldKey="birth_date">
                  <DateInput value={form.birth_date} onChange={(v) => set("birth_date", v)} toYear={new Date().getFullYear()} className={errors.birth_date ? "[&_input]:border-destructive" : ""} />
                </Field>
                <Field label="País *" error={errors.country} fieldKey="country">
                  <Select value={form.country} onValueChange={(v) => set("country", v)}>
                    <SelectTrigger className={errors.country ? "border-destructive" : ""}><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Ciudad *" error={errors.city} fieldKey="city">
                  <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ciudad" className={errors.city ? "border-destructive" : ""} />
                </Field>
                <div className="sm:col-span-2 space-y-2" data-field="languages">
                  <Label className={cn("text-sm font-medium", errors.languages && "text-destructive")}>Idiomas *</Label>
                  <div className="flex flex-wrap gap-4">
                    {LANGUAGES.map((lang) => (
                      <label key={lang} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={form.languages.includes(lang)} onCheckedChange={() => toggleLanguage(lang)} />
                        {lang}
                      </label>
                    ))}
                  </div>
                  {errors.languages && <p className="text-xs text-destructive">{errors.languages}</p>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Contacto y Redes */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Share2 className="h-4 w-4" /> Contacto y Redes Sociales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Email" error={errors.email} fieldKey="email">
                    <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@ejemplo.com" className={errors.email ? "border-destructive" : ""} />
                  </Field>
                  <Field label="Teléfono">
                    <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
                  </Field>
                  <Field label="Instagram URL">
                    <Input value={form.instagram_handle} onChange={(e) => set("instagram_handle", e.target.value)} placeholder="https://instagram.com/username" />
                  </Field>
                  <Field label="Twitter/X URL">
                    <Input value={form.twitter_handle} onChange={(e) => set("twitter_handle", e.target.value)} placeholder="https://x.com/username" />
                  </Field>
                  <Field label="TikTok URL">
                    <Input value={form.tiktok_handle} onChange={(e) => set("tiktok_handle", e.target.value)} placeholder="https://tiktok.com/@username" />
                  </Field>
                  <Field label="YouTube URL">
                    <Input value={form.youtube_handle} onChange={(e) => set("youtube_handle", e.target.value)} placeholder="https://youtube.com/@channel" />
                  </Field>
                  <Field label="LinkedIn URL">
                    <Input value={form.linkedin_handle} onChange={(e) => set("linkedin_handle", e.target.value)} placeholder="https://linkedin.com/in/..." />
                  </Field>
                  <Field label="OnlyFans URL">
                    <Input value={form.onlyfans_url} onChange={(e) => set("onlyfans_url", e.target.value)} placeholder="https://onlyfans.com/..." />
                  </Field>
                </div>
                <div className="space-y-4">
                  <Field label="URL de Foto de Perfil">
                    <Input value={form.profile_photo_url} onChange={(e) => set("profile_photo_url", e.target.value)} placeholder="https://..." />
                  </Field>
                  <Field label="Biografía">
                    <Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Descripción del creador..." rows={4} />
                  </Field>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Operación */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Operación y Documentación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Categoría de Modelo">
                    <Select value={form.category} onValueChange={(v) => set("category", v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Fecha de Inicio Oficial">
                    <DateInput value={form.start_date} onChange={(v) => set("start_date", v)} />
                  </Field>
                </div>

                {/* Documentation */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">Contrato Firmado & Documentos</p>
                      <Button variant="outline" size="sm" onClick={() => openUpload("contracts")}>
                        <Upload className="mr-2 h-4 w-4" /> Subir Archivos
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Formatos: PDF, Word (.doc, .docx) e Imágenes. Máximo 10MB por archivo.</p>
                    <UploadedFilesList files={filesByCategory("contracts")} onRemove={removeUploadedFile} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">Fotos y Videos Extras</p>
                      <Button variant="outline" size="sm" onClick={() => openUpload("extras")}>
                        <Upload className="mr-2 h-4 w-4" /> Subir Archivos
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Formatos: Imágenes y Videos. Máximo 20MB por archivo.</p>
                    <UploadedFilesList files={filesByCategory("extras")} onRemove={removeUploadedFile} />
                  </div>
                </div>

                <FileUploadModal
                  open={uploadModal.open}
                  onClose={() => setUploadModal((p) => ({ ...p, open: false }))}
                  category={uploadModal.category}
                  tempId={tempId}
                  onFilesUploaded={handleFilesUploaded}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 4: Plataformas Activas */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" /> Plataformas Activas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Agrega las plataformas que tiene activas la creadora con su monto y periodicidad de pago.
                </p>

                {form.platforms.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No hay plataformas agregadas aún</p>
                  </div>
                )}

                {form.platforms.map((platform) => (
                  <div key={platform.id} className="rounded-lg border p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Plataforma</Label>
                        <Select value={platform.name} onValueChange={(v) => updatePlatform(platform.id, "name", v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_PLATFORMS.filter((p) => !usedPlatformNames.includes(p) || p === platform.name).map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                            <SelectItem value="Otra">Otra (personalizada)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {platform.name === "Otra" && (
                        <div className="space-y-1.5">
                          <Label className="text-sm">Nombre</Label>
                          <Input
                            value={platform.customName}
                            onChange={(e) => updatePlatform(platform.id, "customName", e.target.value)}
                            placeholder="Nombre de la plataforma"
                          />
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label className="text-sm">Monto ($)</Label>
                        <Input
                          type="number"
                          value={platform.amount || ""}
                          onChange={(e) => updatePlatform(platform.id, "amount", Number(e.target.value))}
                          placeholder="0.00"
                          min={0}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-sm">Frecuencia</Label>
                        <Select value={platform.frequency} onValueChange={(v) => updatePlatform(platform.id, "frequency", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PLATFORM_FREQUENCIES.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-end">
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removePlatform(platform.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={addPlatform} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Agregar plataforma
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Condiciones Comerciales */}
          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Condiciones Comerciales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <CommissionTiersEditor
                  commissionType={form.commission_type}
                  fixedPercentage={form.agency_percentage}
                  tiers={form.commission_tiers}
                  onTypeChange={(t) => set("commission_type", t)}
                  onFixedPercentageChange={(v) => set("agency_percentage", v)}
                  onTiersChange={(t) => set("commission_tiers", t)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Método de Pago *" error={errors.payment_method} fieldKey="payment_method">
                    <Select value={form.payment_method} onValueChange={(v) => set("payment_method", v)}>
                      <SelectTrigger className={errors.payment_method ? "border-destructive" : ""}><SelectValue placeholder="Seleccionar método" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Fecha en la que inicia a cobrar">
                    <DateInput value={form.billing_start_date} onChange={(v) => set("billing_start_date", v)} />
                  </Field>
                  <Field label="Periodicidad de Cobro">
                    <Select value={form.billing_frequency} onValueChange={(v) => set("billing_frequency", v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar periodicidad" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quincenal">Quincenal</SelectItem>
                        <SelectItem value="mensual">Mensual</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Dirección de Facturación">
                    <Input value={form.billing_address} onChange={(e) => set("billing_address", e.target.value)} placeholder="Dirección completa" />
                  </Field>
                </div>

                <Field label="Notas Internas">
                  <Textarea
                    value={form.internal_notes}
                    onChange={(e) => set("internal_notes", e.target.value)}
                    placeholder="Observaciones del equipo, comentarios del closer, etc..."
                    rows={4}
                  />
                </Field>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <footer className="bg-background border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
        <Button variant="outline" onClick={goPrev} disabled={step === 1}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
        </Button>
        <span className="text-sm text-muted-foreground">Paso {step} de {STEPS.length}</span>
        {step < STEPS.length ? (
          <Button onClick={goNext}>
            Siguiente <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : "Guardar Creador"}
          </Button>
        )}
      </footer>
    </main>
  );
};

function Field({ label, error, fieldKey, children }: { label: string; error?: string; fieldKey?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5" data-field={fieldKey}>
      <Label className={cn("text-sm font-medium", error && "text-destructive")}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function UploadedFilesList({ files, onRemove }: { files: UploadedFile[]; onRemove: (url: string) => void }) {
  if (!files.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {files.map((f) => (
        <div key={f.url} className="flex items-center gap-2 text-sm rounded-md border px-3 py-1.5">
          {f.type.startsWith("image/") ? (
            <img src={f.url} alt={f.name} className="h-8 w-8 rounded object-cover shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate flex-1">{f.name}</span>
          <button onClick={() => onRemove(f.url)} className="text-muted-foreground hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default NuevoCreadorForm;
