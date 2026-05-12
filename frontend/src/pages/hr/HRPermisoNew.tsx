import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, CalendarIcon, Upload, X, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Wifi, LogOut, LogIn, User, Stethoscope, GraduationCap, Briefcase,
} from "lucide-react";

const PERMISSION_TYPES = [
  { value: "permiso_remoto", label: "Trabajo Remoto", icon: Wifi },
  { value: "salida_temprana", label: "Salida Temprana", icon: LogOut },
  { value: "llegada_tarde", label: "Llegada Tarde", icon: LogIn },
  { value: "permiso_personal", label: "Permiso Personal", icon: User },
  { value: "permiso_medico", label: "Permiso Médico", icon: Stethoscope },
  { value: "permiso_academico", label: "Permiso Académico", icon: GraduationCap },
  { value: "permiso_diligencia", label: "Diligencia Personal", icon: Briefcase },
  { value: "incapacidad", label: "Incapacidad", icon: Stethoscope },
];

export default function HRPermisoNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [permisoType, setPermisoType] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [horario, setHorario] = useState("");
  const [motivo, setMotivo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const isValid = !!employeeId && !!permisoType && !!date;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(selected.type)) {
      toast({ title: "Solo se permiten imágenes (JPG, PNG, WEBP) o PDF", variant: "destructive" });
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast({ title: "El archivo no debe superar 10 MB", variant: "destructive" });
      return;
    }
    setFile(selected);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      let documentUrl: string | null = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("absence-documents")
          .upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from("absence-documents")
          .getPublicUrl(path);
        documentUrl = urlData.publicUrl;
      }

      const dateStr = format(date!, "yyyy-MM-dd");
      const { error } = await supabase.from("absences").insert({
        employee_id: employeeId!,
        absence_type: permisoType,
        start_date: dateStr,
        end_date: dateStr,
        total_days: 1,
        notes: horario || null,
        reason: motivo || null,
        document_url: documentUrl,
        status: "pending",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permisos"] });
      toast({ title: "Solicitud de permiso creada" });
      navigate("/hr/permisos");
    },
    onError: () => {
      toast({ title: "Error al crear la solicitud", variant: "destructive" });
    },
    onSettled: () => setUploading(false),
  });

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <nav className="text-sm text-muted-foreground mb-2">
          <button onClick={() => navigate("/hr/permisos")} className="hover:text-foreground transition-colors">Permisos</button>
          <span className="mx-2">›</span>
          <span className="text-foreground font-medium">Nueva Solicitud</span>
        </nav>
        <button
          onClick={() => navigate("/hr/permisos")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6" /> Nueva Solicitud
        </h1>
        <p className="text-sm text-muted-foreground">Registra un permiso, ausencia o incapacidad</p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6 rounded-lg border border-border p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Empleado <span className="text-destructive">*</span></Label>
              <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Solicitud <span className="text-destructive">*</span></Label>
              <Select value={permisoType} onValueChange={setPermisoType}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {PERMISSION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fecha <span className="text-destructive">*</span></Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd 'de' MMMM yyyy", { locale: es }) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
                    locale={es}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Horario</Label>
              <Input
                placeholder="Ej: 14:00 - 17:00"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              placeholder="Describa el motivo de la solicitud..."
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Documento de soporte</Label>
            <p className="text-xs text-muted-foreground">Imagen o PDF (máx. 10 MB)</p>
            {file ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                {file.type.startsWith("image/") ? (
                  <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm truncate flex-1">{file.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Seleccionar archivo
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      <footer className="border-t border-border bg-background px-6 py-4 shrink-0">
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/hr/permisos")}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending || uploading}
          >
            {mutation.isPending ? "Guardando..." : "Crear Solicitud"}
          </Button>
        </div>
      </footer>
    </main>
  );
}
