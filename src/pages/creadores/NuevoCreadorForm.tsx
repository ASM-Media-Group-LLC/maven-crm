import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Pencil, Save, Upload, X,
  User, Phone, Share2, Image, Settings, FileText, DollarSign, Camera, StickyNote,
} from "lucide-react";
import FileUploadModal, { type UploadCategory, type UploadedFile } from "@/components/FileUploadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAddCreadorWithBusiness } from "./useCreadores";

const AGENCIES = ["Kash Agency", "Atomic Agency", "Unlok Platform", "Elite Models", "ORA Agency", "Exchange", "Otra"];
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
const PLATFORMS = ["Onlyfans", "Unlok", "Fansly", "Patreon", "Otra"];
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
  piclink_url: string;
  piclink_monthly_payment: number;
  piclink_env_confirmed: boolean;
  profile_photo_url: string;
  bio: string;
  category: string;
  start_date: string;
  has_piclink: boolean;
  agency_percentage: number;
  payment_method: string;
  blue_package: boolean;
  blue_package_amount: number;
  main_platform: string;
  secondary_platform: string;
  platform_username: string;
  internal_notes: string;
}

const defaultForm: FormData = {
  assigned_agency: "",
  status: "onboarding",
  name: "",
  artistic_name: "",
  age: 18,
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
  piclink_url: "",
  piclink_monthly_payment: 0,
  piclink_env_confirmed: false,
  profile_photo_url: "",
  bio: "",
  category: "",
  start_date: "",
  has_piclink: false,
  agency_percentage: 15,
  payment_method: "",
  blue_package: false,
  blue_package_amount: 0,
  main_platform: "",
  secondary_platform: "",
  platform_username: "",
  internal_notes: "",
};

const testData: FormData = {
  assigned_agency: "Agency Alpha",
  status: "onboarding",
  name: "María García López",
  artistic_name: "MariGar",
  age: 24,
  birth_date: "2002-03-15",
  country: "Colombia",
  city: "Medellín",
  languages: ["Español", "English"],
  email: "maria.garcia@email.com",
  phone: "+573001234567",
  instagram_handle: "https://instagram.com/marigar",
  twitter_handle: "https://x.com/marigar",
  tiktok_handle: "https://tiktok.com/@marigar",
  youtube_handle: "https://youtube.com/@marigar",
  linkedin_handle: "",
  onlyfans_url: "https://onlyfans.com/marigar",
  piclink_url: "https://piclink.com/marigar",
  piclink_monthly_payment: 75,
  piclink_env_confirmed: true,
  profile_photo_url: "https://i.pravatar.cc/300?u=marigar",
  bio: "Creadora de contenido especializada en lifestyle y fitness. 3 años de experiencia en plataformas digitales.",
  category: "A",
  start_date: "2026-02-01",
  has_piclink: true,
  agency_percentage: 20,
  payment_method: "Transferencia",
  blue_package: true,
  blue_package_amount: 500,
  main_platform: "Onlyfans",
  secondary_platform: "Fansly",
  platform_username: "@marigar",
  internal_notes: "Referida por closer Juan. Alta motivación, excelente contenido fotográfico.",
};

const NuevoCreadorForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(defaultForm);
  const mutation = useAddCreadorWithBusiness();
  const tempId = useMemo(() => crypto.randomUUID(), []);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; category: UploadCategory }>({ open: false, category: "contracts" });

  const openUpload = (category: UploadCategory) => setUploadModal({ open: true, category });
  const handleFilesUploaded = (files: UploadedFile[]) => setUploadedFiles((prev) => [...prev, ...files]);
  const removeUploadedFile = (url: string) => setUploadedFiles((prev) => prev.filter((f) => f.url !== url));
  const filesByCategory = (cat: UploadCategory) => uploadedFiles.filter((f) => f.category === cat);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleLanguage = (lang: string) =>
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    try {
      const documents = uploadedFiles.map((f) => ({
        file_name: f.name,
        file_url: f.url,
        file_type: f.type,
        description: f.category,
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
          piclink_url: form.piclink_url || null,
          profile_photo_url: form.profile_photo_url || null,
          bio: form.bio || null,
          internal_notes: form.internal_notes || null,
        },
        business: {
          assigned_agency: form.assigned_agency || null,
          agency_percentage: form.agency_percentage || null,
          payment_method: form.payment_method || null,
          blue_package: form.blue_package,
          li_payment_amount: form.blue_package ? form.blue_package_amount : null,
          has_piclink: form.has_piclink,
          piclink_monthly_payment: form.piclink_monthly_payment || null,
          piclink_env_confirmed: form.piclink_env_confirmed,
          main_platform: form.main_platform || null,
          secondary_platform: form.secondary_platform || null,
          platform_username: form.platform_username || null,
          start_date: form.start_date || null,
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
    <main className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6 pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/creadores")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a Creadores
          </button>
          <Button variant="outline" size="sm" onClick={() => setForm(testData)}>
            <Pencil className="mr-2 h-4 w-4" /> Llenar datos de prueba
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Nuevo Creador
          </h1>
          <p className="text-sm text-muted-foreground">Completa los detalles del nuevo creador</p>
        </div>

        {/* Seccion 1 - Información Básica */}
        <Section icon={<User className="h-5 w-5" />} title="Información Básica">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Agencia Asignada *">
              <Select value={form.assigned_agency} onValueChange={(v) => set("assigned_agency", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar agencia" /></SelectTrigger>
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
            <Field label="Nombre Completo *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nombre completo" />
            </Field>
            <Field label="Nombre Artístico">
              <Input value={form.artistic_name} onChange={(e) => set("artistic_name", e.target.value)} placeholder="Nombre artístico" />
            </Field>
            <Field label="Edad *">
              <Input type="number" value={form.age} onChange={(e) => set("age", Number(e.target.value))} min={18} />
            </Field>
            <Field label="Fecha de Nacimiento *">
              <Input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
            </Field>
            <Field label="País *">
              <Select value={form.country} onValueChange={(v) => set("country", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ciudad *">
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ciudad" />
            </Field>
          </div>
          <div className="space-y-2 pt-2">
            <Label className="text-sm font-medium">Idiomas *</Label>
            <div className="flex flex-wrap gap-4">
              {LANGUAGES.map((lang) => (
                <label key={lang} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.languages.includes(lang)}
                    onCheckedChange={() => toggleLanguage(lang)}
                  />
                  {lang}
                </label>
              ))}
            </div>
          </div>
        </Section>

        {/* Seccion 2 - Contacto */}
        <Section icon={<Phone className="h-5 w-5" />} title="Información de Contacto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@ejemplo.com" />
            </Field>
            <Field label="Teléfono">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+573001234567" />
            </Field>
          </div>
        </Section>

        {/* Seccion 3 - Redes Sociales */}
        <Section icon={<Share2 className="h-5 w-5" />} title="Redes Sociales">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </Section>

        {/* Seccion 4 - Perfil y Biografía */}
        <Section icon={<Image className="h-5 w-5" />} title="Perfil y Biografía">
          <Field label="URL de Foto de Perfil">
            <Input value={form.profile_photo_url} onChange={(e) => set("profile_photo_url", e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Biografía">
            <Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Descripción del creador..." rows={4} />
          </Field>
        </Section>

        {/* Seccion 5 - Operación */}
        <Section icon={<Settings className="h-5 w-5" />} title="Operación & Categorización">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Categoría de Modelo">
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fecha de Inicio Oficial">
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* Seccion 6 - Documentación */}
        <Section icon={<FileText className="h-5 w-5" />} title="Documentación">
          <div className="space-y-4">
            {/* Contrato Firmado */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">Contrato Firmado & Documentos</p>
                <Button variant="outline" size="sm" onClick={() => openUpload("contracts")}>
                  <Upload className="mr-2 h-4 w-4" /> Subir Archivos
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Formatos: PDF, Word (.doc, .docx) e Imágenes. Máximo 10MB por archivo, 10 archivos.</p>
              <UploadedFilesList files={filesByCategory("contracts")} onRemove={removeUploadedFile} />
            </div>

            {/* PickLink Confirmado Card */}
            <div className="rounded-lg border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Tiene PickLink Confirmado?</p>
                <p className="text-xs text-muted-foreground">Marcar si el creador tiene PickLink activo</p>
              </div>
              <Checkbox checked={form.has_piclink} onCheckedChange={(v) => set("has_piclink", !!v)} />
            </div>

            {/* Campos condicionales PickLink */}
            {form.has_piclink && (
              <div className="border-l-2 border-primary pl-4 space-y-4 ml-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Dirección de PickLink">
                    <Input value={form.piclink_url} onChange={(e) => set("piclink_url", e.target.value)} placeholder="https://piclink.com/username" />
                  </Field>
                  <Field label="Pago Mensual PickLink">
                    <Input type="number" value={form.piclink_monthly_payment} onChange={(e) => set("piclink_monthly_payment", Number(e.target.value))} placeholder="50.00" min={0} />
                  </Field>
                </div>
                <div>
                  <div className="mb-1">
                    <p className="text-sm font-medium">Fotos de PickLink (Comprobante)</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Formatos: Imágenes (JPG, PNG, GIF, WebP). Máximo 10MB por archivo.</p>
                  <UploadedFilesList files={filesByCategory("piclink")} onRemove={removeUploadedFile} />
                </div>
              </div>
            )}

            {/* Fotos y Videos Extras */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">Fotos y Videos Extras</p>
                <Button variant="outline" size="sm" onClick={() => openUpload("extras")}>
                  <Upload className="mr-2 h-4 w-4" /> Subir Archivos
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Formatos: Imágenes (JPG, PNG, GIF) y Videos (MP4, MOV). Máximo 20MB por archivo.</p>
              <UploadedFilesList files={filesByCategory("extras")} onRemove={removeUploadedFile} />
            </div>

            {/* PickLink ENV Confirmado Card */}
            <div className="rounded-lg border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">PickLink ENV Confirmado</p>
                <p className="text-xs text-muted-foreground">Tag "ENV" configurado en Bios</p>
              </div>
              <Checkbox checked={form.piclink_env_confirmed} onCheckedChange={(v) => set("piclink_env_confirmed", !!v)} />
            </div>
          </div>

          <FileUploadModal
            open={uploadModal.open}
            onClose={() => setUploadModal((p) => ({ ...p, open: false }))}
            category={uploadModal.category}
            tempId={tempId}
            onFilesUploaded={handleFilesUploaded}
          />
        </Section>

        {/* Seccion 7 - Condiciones Comerciales */}
        <Section icon={<DollarSign className="h-5 w-5" />} title="Condiciones Comerciales">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Porcentaje Agencia (%)">
              <Input type="number" value={form.agency_percentage} onChange={(e) => set("agency_percentage", Number(e.target.value))} min={0} max={100} />
            </Field>
            <Field label="Método de Pago">
              <Select value={form.payment_method} onValueChange={(v) => set("payment_method", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar método" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="rounded-lg border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Blue Package</p>
              <p className="text-xs text-muted-foreground">¿Tiene paquete Blue?</p>
            </div>
            <Checkbox checked={form.blue_package} onCheckedChange={(v) => set("blue_package", !!v)} />
          </div>
          {form.blue_package && (
            <div className="border-l-2 border-primary pl-4 ml-2">
              <Field label="Monto de Pago">
                <Input type="number" value={form.blue_package_amount} onChange={(e) => set("blue_package_amount", Number(e.target.value))} placeholder="1000.00" min={0} />
              </Field>
            </div>
          )}
        </Section>

        {/* Seccion 8 - Captura y Monetización */}
        <Section icon={<Camera className="h-5 w-5" />} title="Captura y Monetización">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">Capturas de Monetización</p>
              <Button variant="outline" size="sm" onClick={() => openUpload("extras")}>
                <Upload className="mr-2 h-4 w-4" /> Subir Archivos
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Plataforma Principal">
                <Select value={form.main_platform} onValueChange={(v) => set("main_platform", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar plataforma" /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Plataforma Secundaria">
                <Select value={form.secondary_platform} onValueChange={(v) => set("secondary_platform", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar plataforma" /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Usuario en Plataforma">
                <Input value={form.platform_username} onChange={(e) => set("platform_username", e.target.value)} placeholder="@username" />
              </Field>
            </div>
          </div>
        </Section>

        {/* Seccion 9 - Notas Internas */}
        <Section icon={<StickyNote className="h-5 w-5" />} title="Notas Internas">
          <Field label="Notas Internas">
            <Textarea
              value={form.internal_notes}
              onChange={(e) => set("internal_notes", e.target.value)}
              placeholder="Observaciones del equipo, comentarios del closer, etc..."
              rows={6}
            />
          </Field>
        </Section>
      </div>

      {/* Footer fijo */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur-sm px-6 py-3">
        <div className="max-w-4xl mx-auto flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/creadores")}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            <Save className="mr-2 h-4 w-4" /> {mutation.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </main>
  );
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
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
