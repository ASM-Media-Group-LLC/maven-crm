import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Building2, MapPin, Network, ChevronDown, ChevronRight } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { HRMetricCard } from "@/components/hr/HRMetricCard";
import EmployeeAreaBadge from "@/components/hr/EmployeeAreaBadge";
import { useEmployees, useDepartments } from "@/hooks/useEmployees";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EmployeeWithRelations } from "@/hooks/useEmployees";

type ViewTab = "tabla" | "arbol" | "grid" | "departamento";

function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

// ---------- Tree helpers ----------
type TreeNode = EmployeeWithRelations & { children: TreeNode[] };

function buildTree(employees: EmployeeWithRelations[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  employees.forEach((e) => map.set(e.id, { ...e, children: [] }));
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (node.reports_to && map.has(node.reports_to)) {
      map.get(node.reports_to)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function TreeNodeComponent({ node, level = 0 }: { node: TreeNode; level?: number }) {
  const [open, setOpen] = useState(level < 2);
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;

  return (
    <div className={level > 0 ? "ml-6 border-l border-border pl-4" : ""}>
      <div
        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 cursor-pointer group"
        onClick={() => navigate(`/hr/empleado/${node.id}`)}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        ) : (
          <span className="w-5" />
        )}
        <UserAvatar
          name={`${node.first_name} ${node.last_name}`}
          src={node.profile_photo_url}
          seed={node.id}
          size="sm"
          className="h-8 w-8 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{node.first_name} {node.last_name}</p>
          <p className="text-xs text-muted-foreground truncate">{node.positions?.name ?? "Sin cargo"}</p>
        </div>
        {hasChildren && (
          <span className="ml-auto text-xs text-muted-foreground">{node.children.length}</span>
        )}
      </div>
      {open && hasChildren && (
        <div className="mt-1">
          {node.children.map((child) => (
            <TreeNodeComponent key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Main Page ----------
export default function HROrganigrama() {
  const navigate = useNavigate();
  const { data: employees, isLoading } = useEmployees();
  const { data: departments } = useDepartments();
  const { data: companies } = useCompanies();
  const [companyFilter, setCompanyFilter] = useState("all");
  const [view, setView] = useState<ViewTab>("tabla");

  const activeEmployees = useMemo(() => {
    if (!employees) return [];
    let list = employees.filter((e) => e.status === "activo");
    if (companyFilter !== "all") list = list.filter((e) => (e as any).company_id === companyFilter);
    return list;
  }, [employees, companyFilter]);

  const subordinateCount = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      if (e.reports_to) counts[e.reports_to] = (counts[e.reports_to] ?? 0) + 1;
    });
    return counts;
  }, [activeEmployees]);

  const supervisorMap = useMemo(() => {
    const map: Record<string, string> = {};
    activeEmployees.forEach((e) => { map[e.id] = `${e.first_name} ${e.last_name}`; });
    return map;
  }, [activeEmployees]);

  const uniqueCities = useMemo(() => {
    const cities = new Set(activeEmployees.map((e) => e.city).filter(Boolean));
    return cities.size;
  }, [activeEmployees]);

  const tree = useMemo(() => buildTree(activeEmployees), [activeEmployees]);

  const groupedByDept = useMemo(() => {
    const groups: Record<string, { dept: { name: string; code: string } | null; employees: EmployeeWithRelations[] }> = {};
    activeEmployees.forEach((e) => {
      const key = e.department_id ?? "sin-area";
      if (!groups[key]) groups[key] = { dept: e.departments ?? null, employees: [] };
      groups[key].employees.push(e);
    });
    return Object.values(groups).sort((a, b) => (a.dept?.name ?? "ZZZ").localeCompare(b.dept?.name ?? "ZZZ"));
  }, [activeEmployees]);

  const views: { key: ViewTab; label: string }[] = [
    { key: "tabla", label: "Tabla" },
    { key: "arbol", label: "Árbol" },
    { key: "grid", label: "Grid" },
    { key: "departamento", label: "Por Departamento" },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-background border-b px-6 pt-6 pb-4 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Organigrama</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Estructura organizacional y jerarquías</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <HRMetricCard title="Total Empleados" value={activeEmployees.length} icon={Users} />
          <HRMetricCard title="Empresas" value={companies?.length ?? 1} icon={Building2} />
          <HRMetricCard title="Departamentos" value={departments?.length ?? 0} icon={Network} />
          <HRMetricCard title="Ubicaciones" value={uniqueCities} icon={MapPin} />
        </div>

        {/* View tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {views.map((v) => (
            <Button
              key={v.key}
              variant={view === v.key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </div>

        {/* Company filter */}
        <div className="flex items-center gap-3">
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las Empresas</SelectItem>
              {companies?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {/* TABLA */}
        {view === "tabla" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Posición</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Reporta a</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead className="text-right">Reportes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeEmployees.map((emp) => (
                <TableRow key={emp.id} className="cursor-pointer" onClick={() => navigate(`/hr/empleado/${emp.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={`${emp.first_name} ${emp.last_name}`}
                        src={emp.profile_photo_url}
                        seed={emp.id}
                        size="sm"
                        className="h-8 w-8"
                      />
                      <div>
                        <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.email ?? ""}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{emp.positions?.name ?? "—"}</TableCell>
                  <TableCell>
                    <EmployeeAreaBadge departmentName={emp.departments?.name} departmentCode={emp.departments?.code} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.reports_to ? supervisorMap[emp.reports_to] ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[emp.city, emp.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {subordinateCount[emp.id] ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* ÁRBOL */}
        {view === "arbol" && (
          <div className="space-y-1">
            {tree.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">No hay datos de jerarquía configurados</p>
            ) : (
              tree.map((root) => <TreeNodeComponent key={root.id} node={root} />)
            )}
          </div>
        )}

        {/* GRID */}
        {view === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeEmployees.map((emp) => (
              <Card
                key={emp.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/hr/empleado/${emp.id}`)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <UserAvatar
                    name={`${emp.first_name} ${emp.last_name}`}
                    src={emp.profile_photo_url}
                    seed={emp.id}
                    size="lg"
                    className="h-12 w-12 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{emp.positions?.name ?? "Sin cargo"}</p>
                    <EmployeeAreaBadge departmentName={emp.departments?.name} departmentCode={emp.departments?.code} className="mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* POR DEPARTAMENTO */}
        {view === "departamento" && (
          <div className="space-y-8">
            {groupedByDept.map((group, idx) => (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-3">
                  <EmployeeAreaBadge departmentName={group.dept?.name ?? "Sin área"} departmentCode={group.dept?.code ?? null} />
                  <span className="text-xs text-muted-foreground">({group.employees.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {group.employees.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/hr/empleado/${emp.id}`)}
                    >
                      <UserAvatar
                        name={`${emp.first_name} ${emp.last_name}`}
                        src={emp.profile_photo_url}
                        seed={emp.id}
                        size="sm"
                        className="h-9 w-9 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{emp.positions?.name ?? "Sin cargo"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
