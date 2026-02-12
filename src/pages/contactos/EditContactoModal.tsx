import { useState, useMemo } from "react";
import { Pencil, Upload, X, ImageIcon, Film, FileText, Save } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import FileUploadModal, { type UploadCategory, type UploadedFile } from "@/components/FileUploadModal";
import type { Contacto } from "./ContactosContent";

const CATEGORIES = [
  { value: "A+", label: "A+ (Premium)" },
  { value: "A", label: "A (Alta)" },
  { value: "B+", label: "B+ (Media Alta)" },
  { value: "B", label: "B (Media)" },
  { value: "C", label: "C (Básica)" },
];

const COMPANIES = ["KASH Agency", "alvaroletshoot", "Blue app", "Piclink.me", "Pagomundo", "Exchange", "Unlok"];
const PLATFORMS = ["Instagram", "TikTok", "Twitter/X", "OnlyFans", "Otra"];

const COUNTRY_CODES = [
  { code: "+57", label: "🇨🇴 +57" }, { code: "+52", label: "🇲🇽 +52" },
  { code: "+54", label: "🇦🇷 +54" }, { code: "+34", label: "🇪🇸 +34" },
  { code: "+56", label: "🇨🇱 +56" }, { code: "+51", label: "🇵🇪 +51" },
  { code: "+598", label: "🇺🇾 +598" }, { code: "+55", label: "🇧🇷 +55" },
  { code: "+1", label: "🇺🇸 +1" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: Contacto | null;
}

const EditContactoModal = ({ open, onOpenChange, contacto }: Props) => {
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [compania, setCompania] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+57");
  const [phone, setPhone] = useState("");
  const [plataforma, setPlataforma] = useState("Instagram");
  const [handle, setHandle] = useState("");
  const [notas, setNotas] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<UploadedFile | null>(null);
  const [extraFiles, setExtraFiles] = useState<UploadedFile[]>([]);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; category: UploadCategory }>({ open: false, category: "piclink" });
  const tempId = useMemo(() => crypto.randomUUID(), []);

  // Sync form when contacto changes
  const [lastId, setLastId] = useState<string | null>(null);
  if (contacto && contacto.id !== lastId) {
    setLastId(contacto.id);
    setNombre(contacto.nombre);
    setCategoria(contacto.categoria);
    setHandle(contacto.instagram);
    setCompania("");
    setEmail("");
    setPhone("");
    setNotas("");
    setProfilePhoto(null);
    setExtraFiles([]);
  }

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

  const handleSave = () => {
    if (!nombre.trim() || !handle.trim()) {
      toast({ title: "Nombre y handle son obligatorios", variant: "destructive" });
      return;
    }
    toast({ title: "Contacto actualizado exitosamente" });
    onOpenChange(false);
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
              {/* Nombre + Categoría */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Nombre *</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Categoría</Label>
                  <Select value={categoria} onValueChange={setCategoria}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Compañía */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Compañía</Label>
                <Select value={compania} onValueChange={setCompania}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar compañía" /></SelectTrigger>
                  <SelectContent>
                    {COMPANIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Email + Teléfono */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Teléfono</Label>
                  <div className="flex gap-2">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRY_CODES.map((cc) => <SelectItem key={cc.code} value={cc.code}>{cc.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Número" className="flex-1" />
                  </div>
                </div>
              </div>

              {/* Plataforma + Handle */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Plataforma</Label>
                  <Select value={plataforma} onValueChange={setPlataforma}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Handle/Usuario *</Label>
                  <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@usuario" />
                </div>
              </div>

              {/* Notas */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Notas</Label>
                <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas adicionales..." rows={3} />
              </div>

              {/* Foto de perfil */}
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

              {/* Extra files */}
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
                      <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
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
            <Button onClick={handleSave}>
              <Save className="mr-1.5 h-4 w-4" /> Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileUploadModal
        open={uploadModal.open}
        onClose={() => setUploadModal((prev) => ({ ...prev, open: false }))}
        category={uploadModal.category}
        tempId={tempId}
        onFilesUploaded={handleFilesUploaded}
      />
    </>
  );
};

export default EditContactoModal;
