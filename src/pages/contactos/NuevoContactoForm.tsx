import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, Upload, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  { value: "A+", label: "A+ (Premium)" },
  { value: "A", label: "A (Alta)" },
  { value: "B+", label: "B+ (Media Alta)" },
  { value: "B", label: "B (Media)" },
  { value: "C", label: "C (Básica)" },
];

const COMPANIES = [
  "KASH Agency", "alvaroletshoot", "Blue app", "Piclink.me", "Pagomundo", "Exchange", "Unlok",
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
  plataforma: string;
  instagramLink: string;
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
  plataforma: "Instagram",
  instagramLink: "",
  ticket: "",
  notas: "",
};

const NuevoContactoForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio";
    if (!form.categoria) e.categoria = "La categoría es obligatoria";
    if (!form.instagramLink.trim()) e.instagramLink = "El link de Instagram es obligatorio";
    if (Object.keys(e).length > 0) {
      setErrors(e);
      toast({ title: "Revisa los campos marcados", variant: "destructive" });
      return;
    }
    toast({ title: "Contacto guardado exitosamente" });
    navigate("/contactos");
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
          {/* Nombre + Categoría */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre del Contacto *" error={errors.nombre}>
              <Input
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Nombre completo"
                className={errors.nombre ? "border-destructive" : ""}
              />
            </Field>
            <Field label="Categoría Física *" error={errors.categoria}>
              <Select value={form.categoria} onValueChange={(v) => set("categoria", v)}>
                <SelectTrigger className={errors.categoria ? "border-destructive" : ""}>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Compañía */}
          <Field label="Compañía / Cuenta de Origen">
            <Select value={form.compania} onValueChange={(v) => set("compania", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar compañía" />
              </SelectTrigger>
              <SelectContent>
                {COMPANIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {/* Email + Teléfono */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="email@ejemplo.com"
              />
            </Field>
            <Field label="Teléfono">
              <div className="flex gap-2">
                <Select value={form.countryCode} onValueChange={(v) => set("countryCode", v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((cc) => <SelectItem key={cc.code} value={cc.code}>{cc.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="Número de teléfono"
                  className="flex-1"
                />
              </div>
            </Field>
          </div>

          {/* Plataforma + Instagram */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Plataforma">
              <Select value={form.plataforma} onValueChange={(v) => set("plataforma", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div>
              <Field label="Link de Instagram *" error={errors.instagramLink}>
                <Input
                  value={form.instagramLink}
                  onChange={(e) => set("instagramLink", e.target.value)}
                  placeholder="@usuario o https://instagram.com/usuario"
                  className={errors.instagramLink ? "border-destructive" : ""}
                />
              </Field>
              <p className="text-xs text-muted-foreground mt-1">Puedes ingresar el handle (@usuario) o el link completo</p>
            </div>
          </div>

          {/* Ticket */}
          <Field label="Número de Ticket">
            <Input
              value={form.ticket}
              onChange={(e) => set("ticket", e.target.value)}
              placeholder="Ej: TKT-001"
            />
          </Field>

          {/* Notas */}
          <Field label="Notas">
            <Textarea
              value={form.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Notas adicionales sobre el contacto..."
              rows={4}
            />
          </Field>

          {/* Foto de Perfil */}
          <div>
            <Label className="text-sm font-medium">Foto de Perfil</Label>
            <div className="flex items-center gap-4 mt-2">
              <Avatar className="h-16 w-16">
                <AvatarFallback><UserPlus className="h-6 w-6 text-muted-foreground" /></AvatarFallback>
              </Avatar>
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Subir Foto
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Formatos: JPG, PNG, GIF. Máximo 5MB.</p>
          </div>

          {/* Fotos y Videos Extras */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Fotos y Videos Extras</Label>
              <p className="text-xs text-muted-foreground mt-1">Formatos: Imágenes (JPG, PNG, GIF) y Videos (MP4, MOV). Máximo 20MB por archivo.</p>
            </div>
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Subir Archivos
            </Button>
          </div>
        </div>
      </div>

      {/* Footer fijo */}
      <footer className="border-t border-border bg-background px-6 py-4 shrink-0">
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/contactos")}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            <Save className="mr-2 h-4 w-4" />
            Guardar Contacto
          </Button>
        </div>
      </footer>
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

export default NuevoContactoForm;
