import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import EmployeeAreaBadge from "@/components/hr/EmployeeAreaBadge";
import { PageHeader } from "@/components/ui/page-header";
import { useEmployees, useDepartments } from "@/hooks/useEmployees";
import { useLanguage } from "@/hooks/useLanguage";
import { MODALIDAD_TRABAJO } from "./etiquetasRrhh";

export default function HRDirectoryLookup() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: employees, isLoading } = useEmployees();
  const { data: departments } = useDepartments();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  const activeEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((e) => e.status === "activo");
  }, [employees]);

  const filtered = useMemo(() => {
    let list = activeEmployees;
    if (deptFilter !== "all") list = list.filter((e) => e.department_id === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q) ||
          (e.phone ?? "").includes(q) ||
          (e.mobile ?? "").includes(q) ||
          (e.positions?.name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeEmployees, search, deptFilter]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-background border-b px-6 pt-6 pb-4 space-y-4">
        {/* Header */}
        <PageHeader
          title={t("hr.dir.title")}
          subtitle={t("hr.dir.subtitle", { count: activeEmployees.length })}
        />

        {/* Department tab bar */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap">
          <Button
            variant={deptFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setDeptFilter("all")}
          >
            {t("common.all")}
          </Button>
          {departments?.map((d) => (
            <Button
              key={d.id}
              variant={deptFilter === d.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDeptFilter(d.id)}
            >
              {d.name}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("hr.dir.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("hr.employee")}</TableHead>
                <TableHead>{t("hr.jobTitle")}</TableHead>
                <TableHead>{t("hr.department")}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.location")}</TableHead>
                <TableHead>{t("hr.modality")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    {t("hr.dir.noEmployees")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/hr/empleado/${emp.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={`${emp.first_name} ${emp.last_name}`} src={emp.profile_photo_url ?? undefined} size="sm" />
                        <span className="font-medium text-sm">{emp.first_name} {emp.last_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{emp.positions?.name ?? "—"}</TableCell>
                    <TableCell>
                      <EmployeeAreaBadge departmentName={emp.departments?.name} departmentCode={emp.departments?.code} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.mobile ?? emp.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {emp.city || emp.country ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[emp.city, emp.country].filter(Boolean).join(", ")}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{emp.work_modality && MODALIDAD_TRABAJO[emp.work_modality] ? t(MODALIDAD_TRABAJO[emp.work_modality]) : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
