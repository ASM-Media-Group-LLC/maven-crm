import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronRight } from "lucide-react";
import { useAuditoriaData } from "./auditoria/useAuditoriaData";
import AuditoriaSummaryCards from "./auditoria/AuditoriaSummaryCards";
import AuditoriaHealthChecks from "./auditoria/AuditoriaHealthChecks";
import AuditoriaUsersTable from "./auditoria/AuditoriaUsersTable";
import AuditoriaRoleMatrix from "./auditoria/AuditoriaRoleMatrix";
import AuditoriaActivityLog from "./auditoria/AuditoriaActivityLog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

type Tab = "resumen" | "matriz" | "actividad";

const AuditoriaRoles = () => {
  const { data, isLoading } = useAuditoriaData();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const tabs: { key: Tab; label: TranslationKey }[] = [
    { key: "resumen", label: "admin.audit.tabSummary" },
    { key: "matriz", label: "admin.audit.tabMatrix" },
    { key: "actividad", label: "admin.activity" },
  ];

  // Get unique roles for filter
  const availableRoles = useMemo(() => {
    if (!data) return [];
    const roles = new Set<string>();
    for (const user of data.users) {
      for (const r of user.roles) {
        roles.add(r.role);
      }
    }
    return Array.from(roles).sort();
  }, [data]);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!data) return [];
    let users = data.users;

    if (statusFilter === "with_role") {
      users = users.filter((u) => u.roles.length > 0);
    } else if (statusFilter === "without_role") {
      users = users.filter((u) => u.roles.length === 0);
    }

    if (roleFilter !== "all") {
      users = users.filter((u) => u.roles.some((r) => r.role === roleFilter));
    }

    return users;
  }, [data, statusFilter, roleFilter]);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            {/* Fixed Header */}
            <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <button
                  onClick={() => navigate("/admin")}
                  className="hover:text-foreground transition-colors"
                >
                  {t("admin.administration")}
                </button>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground">{t("admin.audit.crumb")}</span>
              </div>
              <PageHeader
                title={t("admin.audit.title")}
                subtitle={t("admin.audit.subtitle")}
              />
            </header>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : data ? (
                <>
                  {/* KPIs */}
                  <AuditoriaSummaryCards summary={data.summary} />

                  {/* Tabs */}
                  <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                    {tabs.map((tab) => (
                      <Button
                        key={tab.key}
                        variant={activeTab === tab.key ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setActiveTab(tab.key)}
                      >
                        {t(tab.label)}
                      </Button>
                    ))}
                  </div>

                  {/* Tab Content */}
                  {activeTab === "resumen" ? (
                    <>
                      <div>
                        <h2 className="text-lg font-semibold mb-3">Health Checks</h2>
                        <AuditoriaHealthChecks checks={data.health_checks} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="text-lg font-semibold">{t("admin.audit.usersAndRoles")}</h2>
                          <div className="flex items-center gap-2">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                              <SelectTrigger className="w-[140px] h-9">
                                <SelectValue placeholder={t("common.status")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("common.all")}</SelectItem>
                                <SelectItem value="with_role">{t("admin.audit.withRole")}</SelectItem>
                                <SelectItem value="without_role">{t("admin.noRole")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                              <SelectTrigger className="w-[140px] h-9">
                                <SelectValue placeholder={t("common.role")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("admin.audit.allRoles")}</SelectItem>
                                {availableRoles.map((r) => (
                                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="relative max-w-xs">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder={t("admin.manageUsers.searchUser")}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                              />
                            </div>
                          </div>
                        </div>
                        <AuditoriaUsersTable users={filteredUsers} search={search} />
                      </div>
                    </>
                  ) : activeTab === "matriz" ? (
                    <AuditoriaRoleMatrix matrix={data.role_matrix} />
                  ) : (
                    <AuditoriaActivityLog entries={data.audit_entries} profiles={data.profilesMap} />
                  )}
                </>
              ) : null}
            </div>
          </main>
  );
};

export default AuditoriaRoles;
