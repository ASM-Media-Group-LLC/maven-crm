import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/ui/date-input";

// ─── Default checklist ───────────────────────────────────────────────────────
const DEFAULT_CHECKLIST = [
  { category: "Accesos", title: "Revocar correo corporativo", description: "Desactivar cuenta de email corporativo" },
  { category: "Accesos", title: "Revocar acceso a plataformas", description: "Slack, Notion, CRM y demás herramientas" },
  { category: "Accesos", title: "Revocar VPN/sistemas", description: "Desactivar acceso a VPN y sistemas internos" },
  { category: "Accesos", title: "Desactivar badge/tarjeta", description: "Desactivar tarjeta de acceso físico" },
  { category: "Equipamiento", title: "Devolución de laptop/PC", description: "Recoger equipo de cómputo asignado" },
  { category: "Equipamiento", title: "Devolución de badge/llaves", description: "Recoger tarjetas, llaves y accesos físicos" },
  { category: "Equipamiento", title: "Devolución de otros equipos", description: "Monitores, periféricos y otros equipos asignados" },
  { category: "Documentación", title: "Carta de terminación", description: "Generar y entregar carta de terminación laboral" },
  { category: "Documentación", title: "Paz y salvo", description: "Verificar que no existen deudas pendientes" },
  { category: "Documentación", title: "Certificado laboral", description: "Generar certificado laboral para el empleado" },
  { category: "Documentación", title: "Liquidación calculada", description: "Calcular y documentar la liquidación final" },
  { category: "Transferencia", title: "Transferencia de responsabilidades", description: "Reasignar tareas y responsabilidades" },
  { category: "Transferencia", title: "Documentación de procesos", description: "Documentar procesos y procedimientos del cargo" },
  { category: "Transferencia", title: "Entrega de archivos/proyectos", description: "Transferir archivos, proyectos y documentos" },
  { category: "Administrativo", title: "Notificación al equipo", description: "Comunicar la salida al equipo y áreas relevantes" },
  { category: "Administrativo", title: "Desvinculación de seguridad social", description: "Tramitar desvinculación de EPS, ARL, AFP" },
  { category: "Administrativo", title: "Cierre de nómina", description: "Procesar último pago y cierre de nómina" },
];

const TERMINATION_TYPES = [
  { value: "voluntary", label: "Voluntaria" },
  { value: "involuntary", label: "Involuntaria" },
  { value: "end_of_contract", label: "Fin de Contrato" },
  { value: "mutual_agreement", label: "Mutuo Acuerdo" },
];

// ─── Main ────────────────────────────────────────────────────────────────────
export default function HROffboardingNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [terminationType, setTerminationType] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const [exitInterviewDate, setExitInterviewDate] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set(DEFAULT_CHECKLIST.map((_, i) => i)));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active employees
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, department_id, departments(name)")
        .eq("status", "activo")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch existing offboarding employee_ids to exclude
  const { data: existingOffboardingIds = [] } = useQuery({
    queryKey: ["existing-offboarding-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_offboarding")
        .select("employee_id")
        .eq("status", "in_progress");
      if (error) throw error;
      return (data ?? []).map((d) => d.employee_id);
    },
  });

  const availableEmployees = useMemo(
    () => employees.filter((e: any) => !existingOffboardingIds.includes(e.id)),
    [employees, existingOffboardingIds]
  );

  function toggleTask(index: number) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleCategory(category: string) {
    const indices = DEFAULT_CHECKLIST.map((t, i) => (t.category === category ? i : -1)).filter((i) => i >= 0);
    const allSelected = indices.every((i) => selectedTasks.has(i));
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
      return next;
    });
  }

  const canSubmit = selectedEmployeeId && terminationType && terminationDate && selectedTasks.size > 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: offboarding, error: obError } = await supabase
        .from("employee_offboarding")
        .insert({
          employee_id: selectedEmployeeId,
          termination_type: terminationType,
          termination_date: terminationDate,
          termination_reason: terminationReason || null,
          exit_interview_date: exitInterviewDate || null,
          status: "in_progress",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (obError) throw obError;

      const tasksToInsert = Array.from(selectedTasks).map((index, position) => ({
        offboarding_id: offboarding.id,
        category: DEFAULT_CHECKLIST[index].category,
        title: DEFAULT_CHECKLIST[index].title,
        description: DEFAULT_CHECKLIST[index].description,
        position,
        status: "pending",
      }));

      if (tasksToInsert.length > 0) {
        const { error: taskError } = await supabase.from("employee_offboarding_tasks").insert(tasksToInsert);
        if (taskError) throw taskError;
      }

      queryClient.invalidateQueries({ queryKey: ["hr-offboardings"] });
      toast({ title: "Offboarding iniciado correctamente" });
      navigate("/hr/offboarding");
    } catch {
      toast({ title: "Error al iniciar el offboarding", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group checklist by category
  const categories = useMemo(() => {
    const map = new Map<string, { title: string; description: string; index: number }[]>();
    DEFAULT_CHECKLIST.forEach((t, i) => {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push({ title: t.title, description: t.description, index: i });
    });
    return Array.from(map.entries());
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/offboarding")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Volver a Offboarding
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Iniciar Offboarding</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configura el proceso de salida de un empleado</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">

        {/* Section 1: Employee Selection */}
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Selección de Empleado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label>Empleado <span className="text-destructive">*</span></Label>
              <Select value={selectedEmployeeId || undefined} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empleado..." /></SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} {e.departments?.name ? `(${e.departments.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableEmployees.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay empleados disponibles sin offboarding activo.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Configuration */}
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Configuración del Offboarding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Terminación <span className="text-destructive">*</span></Label>
                <Select value={terminationType || undefined} onValueChange={setTerminationType}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                  <SelectContent>
                    {TERMINATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de Terminación <span className="text-destructive">*</span></Label>
                <DateInput value={terminationDate} onChange={setTerminationDate} placeholder="Seleccionar fecha..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo de Salida</Label>
              <Textarea placeholder="Razón de la terminación..." rows={3} value={terminationReason} onChange={(e) => setTerminationReason(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fecha Entrevista de Salida</Label>
                <DateInput value={exitInterviewDate} onChange={setExitInterviewDate} placeholder="Opcional..." />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Checklist */}
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Checklist de Offboarding</CardTitle>
            <p className="text-sm text-muted-foreground">Selecciona las tareas que aplican para este proceso de salida</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {categories.map(([category, tasks], catIdx) => {
              const allSelected = tasks.every((t) => selectedTasks.has(t.index));
              const someSelected = tasks.some((t) => selectedTasks.has(t.index));
              return (
                <div key={category}>
                  {catIdx > 0 && <Separator className="mb-4" />}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allSelected}
                        // @ts-ignore
                        indeterminate={someSelected && !allSelected}
                        onCheckedChange={() => toggleCategory(category)}
                      />
                      <span className="text-sm font-semibold text-foreground">{category}</span>
                      <span className="text-xs text-muted-foreground">
                        ({tasks.filter((t) => selectedTasks.has(t.index)).length}/{tasks.length})
                      </span>
                    </div>
                    <div className="ml-6 space-y-2">
                      {tasks.map((task) => (
                        <label key={task.index} className="flex items-start gap-2.5 cursor-pointer group">
                          <Checkbox
                            checked={selectedTasks.has(task.index)}
                            onCheckedChange={() => toggleTask(task.index)}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-sm text-foreground group-hover:text-primary transition-colors">{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/hr/offboarding")}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
          <UserMinus className="h-4 w-4 mr-1" />
          {isSubmitting ? "Iniciando..." : "Iniciar Offboarding"}
        </Button>
      </div>
    </div>
  );
}
