import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/ui/date-input";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";

// ─── Default checklist ───────────────────────────────────────────────────────
const DEFAULT_CHECKLIST = [
  { category: "Documentación", title: "Contrato firmado", description: "Contrato laboral revisado y firmado por ambas partes" },
  { category: "Documentación", title: "Documento de identidad", description: "Copia del documento de identidad verificada" },
  { category: "Documentación", title: "Foto carné", description: "Foto para credencial y sistemas internos" },
  { category: "Documentación", title: "Afiliaciones (EPS/ARL/AFP)", description: "Registro y afiliación a seguridad social completado" },
  { category: "Documentación", title: "Datos bancarios", description: "Información bancaria registrada para nómina" },
  { category: "Accesos", title: "Cuenta de correo corporativo", description: "Creación y entrega de credenciales de email" },
  { category: "Accesos", title: "Acceso a herramientas de trabajo", description: "Slack, Notion, CRM y demás plataformas" },
  { category: "Accesos", title: "Credenciales de plataforma", description: "Accesos a sistemas internos y VPN" },
  { category: "Equipamiento", title: "Entrega de equipo de cómputo", description: "Laptop/PC configurada y entregada" },
  { category: "Equipamiento", title: "Acceso a oficina / badge", description: "Tarjeta de acceso o llaves de oficina" },
  { category: "Formación", title: "Inducción general de la empresa", description: "Presentación de cultura, valores y políticas" },
  { category: "Formación", title: "Capacitación del área", description: "Formación específica del rol y procesos del equipo" },
  { category: "Formación", title: "Presentación al equipo", description: "Introducción formal con compañeros y líderes" },
];

// ─── Main ────────────────────────────────────────────────────────────────────
export default function HROnboardingNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [buddyId, setBuddyId] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set(DEFAULT_CHECKLIST.map((_, i) => i)));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch employees for buddy select
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

  // Fetch existing onboarding employee_ids to exclude
  const { data: existingOnboardingIds = [] } = useQuery({
    queryKey: ["existing-onboarding-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_onboarding")
        .select("employee_id")
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      return (data ?? []).map((d) => d.employee_id);
    },
  });

  const availableEmployees = useMemo(
    () => employees.filter((e) => !existingOnboardingIds.includes(e.id)),
    [employees, existingOnboardingIds]
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

  const canSubmit = selectedEmployeeId && selectedTasks.size > 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert onboarding record
      const { data: onboarding, error: obError } = await supabase
        .from("employee_onboarding")
        .insert({
          employee_id: selectedEmployeeId,
          start_date: startDate || null,
          buddy_employee_id: buddyId || null,
          notes: notes || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (obError) throw obError;

      // Insert selected tasks
      const tasksToInsert = Array.from(selectedTasks).map((index, position) => ({
        onboarding_id: onboarding.id,
        category: DEFAULT_CHECKLIST[index].category,
        title: DEFAULT_CHECKLIST[index].title,
        description: DEFAULT_CHECKLIST[index].description,
        position,
        status: "pending",
      }));

      if (tasksToInsert.length > 0) {
        const { error: taskError } = await supabase.from("employee_onboarding_tasks").insert(tasksToInsert);
        if (taskError) throw taskError;
      }

      queryClient.invalidateQueries({ queryKey: ["hr-onboardings"] });
      toast({ title: "Onboarding iniciado correctamente" });
      navigate("/hr/onboarding");
    } catch {
      toast({ title: "Error al iniciar el onboarding", variant: "destructive" });
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
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/onboarding")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Volver a Onboarding
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Iniciar Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configura el proceso de integración para un nuevo empleado</p>
        </div>
      </div>

      {/* Scrollable Content */}
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
                <p className="text-xs text-muted-foreground">No hay empleados disponibles sin onboarding activo.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Configuration */}
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Configuración del Onboarding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fecha de Inicio</Label>
                <DateInput value={startDate} onChange={setStartDate} placeholder="Seleccionar fecha..." />
              </div>
              <div className="space-y-1.5">
                <Label>Buddy / Mentor</Label>
                <Select value={buddyId || undefined} onValueChange={setBuddyId}>
                  <SelectTrigger><SelectValue placeholder="Asignar buddy..." /></SelectTrigger>
                  <SelectContent>
                    {employees.filter((e: any) => e.id !== selectedEmployeeId).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas Iniciales</Label>
              <Textarea placeholder="Observaciones para el proceso de onboarding..." rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Checklist */}
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Checklist de Onboarding</CardTitle>
            <p className="text-sm text-muted-foreground">Selecciona las tareas que aplican para este empleado</p>
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
        <Button variant="outline" onClick={() => navigate("/hr/onboarding")}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
          <UserPlus className="h-4 w-4 mr-1" />
          {isSubmitting ? "Iniciando..." : "Iniciar Onboarding"}
        </Button>
      </div>
    </div>
  );
}
