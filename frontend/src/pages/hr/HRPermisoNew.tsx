import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, CalendarIcon, Upload, X, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
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
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { etiqueta, TIPO_PERMISO } from "./etiquetasRrhh";

// `value` es el absence_type que se guarda (DATO); lo que se ve sale de TIPO_PERMISO.
const PERMISSION_TYPES = [
  { value: "permiso_remoto", icon: Wifi },
  { value: "salida_temprana", icon: LogOut },
  { value: "llegada_tarde", icon: LogIn },
  { value: "permiso_personal", icon: User },
  { value: "permiso_medico", icon: Stethoscope },
  { value: "permiso_academico", icon: GraduationCap },
  { value: "permiso_diligencia", icon: Briefcase },
  { value: "incapacidad", icon: Stethoscope },
];

export default function HRPermisoNew() {
  const { t } = useLanguage();
  const f = useFormato();
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
      toast({ title: t("hr.perm.onlyImagesPdf"), variant: "destructive" });
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast({ title: t("hr.perm.maxSize"), variant: "destructive" });
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
      toast({ title: t("hr.perm.created") });
      navigate("/hr/permisos");
    },
    onError: () => {
      toast({ title: t("hr.errorCreatingRequest"), variant: "destructive" });
    },
    onSettled: () => setUploading(false),
  });

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <nav className="text-sm text-muted-foreground mb-2">
          <button onClick={() => navigate("/hr/permisos")} className="hover:text-foreground transition-colors">{t("hr.perm.title")}</button>
          <span className="mx-2">›</span>
          <span className="text-foreground font-medium">{t("hr.newRequest")}</span>
        </nav>
        <button
          onClick={() => navigate("/hr/permisos")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </button>
        <PageHeader
          title={t("hr.newRequest")}
          subtitle={t("hr.perm.newSubtitle")}
          icon={<Clock className="h-6 w-6" />}
        />
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6 rounded-lg border border-border p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("hr.employee")} <span className="text-destructive">*</span></Label>
              <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hr.perm.requestType")} <span className="text-destructive">*</span></Label>
              <Select value={permisoType} onValueChange={setPermisoType}>
                <SelectTrigger>
                  <SelectValue placeholder={t("hr.selectType")} />
                </SelectTrigger>
                <SelectContent>
                  {PERMISSION_TYPES.map((tp) => (
                    <SelectItem key={tp.value} value={tp.value}>
                      <span className="flex items-center gap-2">
                        <tp.icon className="h-3.5 w-3.5" />
                        {etiqueta(t, TIPO_PERMISO, tp.value)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("common.date")} <span className="text-destructive">*</span></Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, f.idioma === "en" ? "MMMM dd, yyyy" : "dd 'de' MMMM yyyy", { locale: f.fechas }) : t("hr.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
                    locale={f.fechas}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hr.schedule")}</Label>
              <Input
                placeholder={t("hr.scheduleExample")}
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("hr.reasonLabel")}</Label>
            <Textarea
              placeholder={t("hr.perm.reasonPlaceholder")}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("hr.perm.supportDoc")}</Label>
            <p className="text-xs text-muted-foreground">{t("hr.perm.supportDocHint")}</p>
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
                {t("hr.perm.selectFile")}
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
          <Button variant="outline" onClick={() => navigate("/hr/permisos")}>{t("common.cancel")}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending || uploading}
          >
            {mutation.isPending ? t("hr.saving") : t("hr.createRequest")}
          </Button>
        </div>
      </footer>
    </main>
  );
}
