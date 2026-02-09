import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Pencil, Save, Upload,
  User, Phone, Share2, Image, Settings, FileText, DollarSign, Camera, StickyNote,
} from "lucide-react";
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

const LANGUAGES = ["Español", "English", "Italiano", "Português", "Français", "Deutsch", "Russkiy"];
const STATUSES = ["onboarding", "active", "paused", "leaving", "terminated"];
const CATEGORIES = ["A+", "A", "B+", "B", "C"];
const PLATFORMS = ["OnlyFans", "Fansly", "Otra"];
const PAYMENT_METHODS = ["Transferencia", "PayPal", "Crypto", "Otro"];
const COUNTRIES = [
  "Colombia", "México", "Argentina", "España", "Estados Unidos", "Venezuela",
  "Chile", "Perú", "Ecuador", "Brasil", "Otro",
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
  profile_photo_url: string;
  bio: string;
  category: string;
  start_date: string;
  has_piclink: boolean;
  agency_percentage: number;
  payment_method: string;
  blue_package: boolean;
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
  profile_photo_url: "",
  bio: "",
  category: "",
  start_date: "",
  has_piclink: false,
  agency_percentage: 15,
  payment_method: "",
  blue_package: false,
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
  profile_photo_url: "https://i.pravatar.cc/300?u=marigar",
  bio: "Creadora de contenido especializada en lifestyle y fitness. 3 años de experiencia en plataformas digitales.",
  category: "A",
  start_date: "2026-02-01",
  has_piclink: true,
  agency_percentage: 20,
  payment_method: "Transferencia",
  blue_package: true,
  main_platform: "OnlyFans",
  secondary_platform: "Fansly",
  platform_username: "@marigar",
  internal_notes: "Referida por closer Juan. Alta motivación, excelente contenido fotográfico.",
};

const NuevoCreadorForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(defaultForm);
  const mutation = useAddCreadorWithBusiness();

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
          agency_percentage: form.agency_percentage || null,
          payment_method: form.payment_method || null,
          blue_package: form.blue_package,
          has_piclink: form.has_piclink,
          main_platform: form.main_platform || null,
          secondary_platform: form.secondary_platform || null,
          platform_username: form.platform_username || null,
          start_date: form.start_date || null,
        },
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
              <Input value={form.assigned_agency} onChange={(e) => set("assigned_agency", e.target.value)} placeholder="Nombre de la agencia" />
            </Field>
            <Field label="Estado">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            <div>
              <p className="text-sm text-muted-foreground mb-2">Contrato Firmado & Documentos</p>
              <Button variant="outline" disabled>
                <Upload className="mr-2 h-4 w-4" /> Subir Archivos
              </Button>
              <p className="text-xs text-muted-foreground mt-1">Requiere configuración de storage</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.has_piclink} onCheckedChange={(v) => set("has_piclink", !!v)} />
              Tiene PickLink Confirmado?
            </label>
          </div>
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
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
            <Checkbox checked={form.blue_package} onCheckedChange={(v) => set("blue_package", !!v)} />
            Tiene paquete Blue?
          </label>
        </Section>

        {/* Seccion 8 - Captura y Monetización */}
        <Section icon={<Camera className="h-5 w-5" />} title="Captura y Monetización">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Capturas de Monetización</p>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Fotos y Videos Extras</p>
              <Button variant="outline" disabled>
                <Upload className="mr-2 h-4 w-4" /> Subir Archivos
              </Button>
              <p className="text-xs text-muted-foreground mt-1">Requiere configuración de storage</p>
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

export default NuevoCreadorForm;
