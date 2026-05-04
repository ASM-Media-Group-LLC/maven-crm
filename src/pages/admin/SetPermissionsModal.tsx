import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { useRolePermissions, useRoles, MODULES_CONFIG, type RolePermission } from "./useRoles";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";

interface SetPermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string | null;
  roleName: string;
}

type PermState = Record<string, { can_access: boolean; data_scope: string }>;

const getKey = (mod: string, sub: string | null) => sub ? `${mod}::${sub}` : mod;

const getDataScopeLabels = (t: (key: any) => string): Record<string, string> => ({
  all: t("permissions.allData"),
  subordinates: t("permissions.subordinates"),
  self: t("permissions.selfOnly"),
});

const getDataScopeOptions = (t: (key: any) => string) => [
  { value: "all", label: t("permissions.allData") },
  { value: "subordinates", label: t("permissions.subordinates") },
  { value: "self", label: t("permissions.selfOnly") },
];

const SetPermissionsModal = ({ open, onOpenChange, roleId, roleName }: SetPermissionsModalProps) => {
  const { t } = useLanguage();
  const { permissions, isLoading, savePermissions, isSaving } = useRolePermissions(roleId);
  const { roles } = useRoles();
  const [state, setState] = useState<PermState>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copyingFrom, setCopyingFrom] = useState(false);

  const isAdminRole = roleName.toLowerCase() === "admin";

  // Other roles the admin can copy from. Hide the current role and any
  // disabled ones so the dropdown only shows valid sources.
  const copyableRoles = useMemo(
    () => roles.filter((r) => r.id !== roleId && r.is_active),
    [roles, roleId],
  );

  const handleCopyFrom = async (sourceId: string, sourceName: string) => {
    setCopyingFrom(true);
    try {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("module, submodule, can_access, data_scope")
        .eq("role_id", sourceId);
      if (error) throw error;

      // Reset state from MODULES_CONFIG, then layer the source role's
      // perms on top. Module-level access falls through to submodules
      // that the source didn't have explicit rows for.
      const next: PermState = {};
      MODULES_CONFIG.forEach((m) => {
        next[getKey(m.module, null)] = { can_access: false, data_scope: "all" };
        m.submodules.forEach((sub) => {
          next[getKey(m.module, sub)] = { can_access: false, data_scope: "all" };
        });
      });
      (data ?? []).forEach((p) => {
        const key = getKey(p.module, p.submodule);
        if (next[key] !== undefined) {
          next[key] = { can_access: p.can_access, data_scope: p.data_scope };
        }
      });
      MODULES_CONFIG.forEach((m) => {
        if (m.submodules.length === 0) return;
        const moduleVal = next[getKey(m.module, null)];
        m.submodules.forEach((sub) => {
          const subKey = getKey(m.module, sub);
          const hasSubInSource = (data ?? []).some(
            (p) => p.module === m.module && p.submodule === sub,
          );
          if (!hasSubInSource) {
            next[subKey] = { ...next[subKey], can_access: moduleVal.can_access, data_scope: moduleVal.data_scope };
          }
        });
      });
      setState(next);
      toast.success(`Permisos copiados de ${sourceName}`, {
        description: "Recuerda guardar para aplicarlos.",
      });
    } catch (e) {
      toast.error("No se pudo copiar", { description: (e as Error).message });
    } finally {
      setCopyingFrom(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const s: PermState = {};
    // If admin and no saved permissions, default everything to enabled
    const defaultOn = isAdminRole && permissions.length === 0;
    MODULES_CONFIG.forEach((m) => {
      s[getKey(m.module, null)] = { can_access: defaultOn, data_scope: "all" };
      m.submodules.forEach((sub) => {
        s[getKey(m.module, sub)] = { can_access: defaultOn, data_scope: "all" };
      });
    });
    permissions.forEach((p) => {
      const key = getKey(p.module, p.submodule);
      if (s[key] !== undefined) {
        s[key] = { can_access: p.can_access, data_scope: p.data_scope };
      }
    });
    // Inherit module-level access for any submodule that has no saved
    // row of its own. This keeps existing roles working when we ship
    // new sub-keys (e.g. "Reportes" replacing legacy "Sales Report"):
    // they pick up whatever the parent had instead of silently
    // defaulting to off.
    MODULES_CONFIG.forEach((m) => {
      if (m.submodules.length === 0) return;
      const moduleKey = getKey(m.module, null);
      const moduleHasPerm = permissions.some(
        (p) => p.module === m.module && !p.submodule,
      );
      if (!moduleHasPerm) return;
      const moduleVal = s[moduleKey];
      m.submodules.forEach((sub) => {
        const hasSubPerm = permissions.some(
          (p) => p.module === m.module && p.submodule === sub,
        );
        if (!hasSubPerm) {
          const subKey = getKey(m.module, sub);
          s[subKey] = { ...s[subKey], can_access: moduleVal.can_access, data_scope: moduleVal.data_scope };
        }
      });
    });
    setState(s);
  }, [permissions, open, isAdminRole]);

  const allModuleKeys = useMemo(() => MODULES_CONFIG.map((m) => getKey(m.module, null)), []);
  const allSubKeys = useMemo(() => MODULES_CONFIG.flatMap((m) => m.submodules.map((s) => getKey(m.module, s))), []);
  const allKeys = useMemo(() => [...allModuleKeys, ...allSubKeys], [allModuleKeys, allSubKeys]);

  const allMenusChecked = useMemo(() => allModuleKeys.every((k) => state[k]?.can_access), [state, allModuleKeys]);
  const allFunctionsChecked = useMemo(() => allSubKeys.length > 0 && allSubKeys.every((k) => state[k]?.can_access), [state, allSubKeys]);

  // Toggle all menus AND all functions together
  const toggleAllMenus = (checked: boolean) => {
    setState((prev) => {
      const next = { ...prev };
      allKeys.forEach((k) => { next[k] = { ...next[k], can_access: checked }; });
      return next;
    });
  };

  const toggleAllFunctions = (checked: boolean) => {
    setState((prev) => {
      const next = { ...prev };
      allSubKeys.forEach((k) => { next[k] = { ...next[k], can_access: checked }; });
      return next;
    });
  };

  const setGlobalDataScope = (scope: string) => {
    setState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { next[k] = { ...next[k], data_scope: scope }; });
      return next;
    });
  };

  // Toggle module + cascade to all its submodules. When the parent
  // checkbox is in indeterminate state, treat the click as "select all"
  // (cleanest user expectation).
  const toggleModule = (mod: string) => {
    setState((prev) => {
      const next = { ...prev };
      const moduleKey = getKey(mod, null);
      const cfg = MODULES_CONFIG.find((m) => m.module === mod);
      const subs = cfg?.submodules ?? [];
      const allSubsOn =
        subs.length > 0 && subs.every((s) => prev[getKey(mod, s)]?.can_access);
      const moduleOn = prev[moduleKey]?.can_access;
      // If everything's on → turn it all off. Otherwise turn it all on.
      const newVal = !(moduleOn && (subs.length === 0 || allSubsOn));
      next[moduleKey] = { ...next[moduleKey], can_access: newVal };
      subs.forEach((sub) => {
        const k = getKey(mod, sub);
        next[k] = { ...next[k], can_access: newVal };
      });
      return next;
    });
  };

  // Toggle a single sub and re-derive the parent module: if any sub is
  // on, the module should read as "active" (so the sidebar still shows
  // it); if every sub is off, the module is off.
  const toggleSub = (mod: string, key: string) => {
    setState((prev) => {
      const next = { ...prev, [key]: { ...prev[key], can_access: !prev[key]?.can_access } };
      const cfg = MODULES_CONFIG.find((m) => m.module === mod);
      if (cfg && cfg.submodules.length > 0) {
        const moduleKey = getKey(mod, null);
        const anySubOn = cfg.submodules.some(
          (sub) => next[getKey(mod, sub)]?.can_access,
        );
        next[moduleKey] = { ...next[moduleKey], can_access: anySubOn };
      }
      return next;
    });
  };

  // Returns true / false / "indeterminate" so the parent checkbox can
  // visually reflect partial sub-selection.
  const getModuleCheckState = (mod: string): boolean | "indeterminate" => {
    const cfg = MODULES_CONFIG.find((m) => m.module === mod);
    const moduleKey = getKey(mod, null);
    const moduleOn = state[moduleKey]?.can_access ?? false;
    if (!cfg || cfg.submodules.length === 0) return moduleOn;
    const subStates = cfg.submodules.map((s) => state[getKey(mod, s)]?.can_access);
    const allOn = subStates.every(Boolean);
    const anyOn = subStates.some(Boolean);
    if (allOn) return true;
    if (anyOn) return "indeterminate";
    return false;
  };

  const setModuleDataScope = (mod: string, scope: string) => {
    setState((prev) => {
      const next = { ...prev };
      const moduleKey = getKey(mod, null);
      next[moduleKey] = { ...next[moduleKey], data_scope: scope };
      const cfg = MODULES_CONFIG.find((m) => m.module === mod);
      cfg?.submodules.forEach((sub) => {
        const k = getKey(mod, sub);
        next[k] = { ...next[k], data_scope: scope };
      });
      return next;
    });
  };

  const getModuleDataScope = (mod: string): string => {
    return state[getKey(mod, null)]?.data_scope ?? "all";
  };

  const getEnabledSubCount = (mod: string): number => {
    const cfg = MODULES_CONFIG.find((m) => m.module === mod);
    if (!cfg || cfg.submodules.length === 0) return 0;
    return cfg.submodules.filter((sub) => state[getKey(mod, sub)]?.can_access).length;
  };

  const handleSave = () => {
    if (!roleId) return;
    const perms: RolePermission[] = [];
    Object.entries(state).forEach(([key, val]) => {
      const parts = key.split("::");
      perms.push({
        role_id: roleId,
        module: parts[0],
        submodule: parts[1] || null,
        can_access: val.can_access,
        data_scope: val.data_scope,
      });
    });
    savePermissions(perms);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <DialogTitle>
                {t("permissions.title")} <span className="font-bold capitalize">{roleName}</span>
              </DialogTitle>
              <DialogDescription>{t("permissions.description")}</DialogDescription>
            </div>
            {copyableRoles.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    disabled={copyingFrom}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copyingFrom ? "Copiando…" : "Copiar de otro rol"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {copyableRoles.map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={() => handleCopyFrom(r.id, r.name)}
                      className="capitalize"
                    >
                      {r.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="h-[58vh] pr-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 pb-3 border-b border-border mb-4 px-1">
            <div className="flex items-center gap-2">
              <Checkbox checked={allMenusChecked} onCheckedChange={(c) => toggleAllMenus(!!c)} />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("permissions.menus")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={allFunctionsChecked} onCheckedChange={(c) => toggleAllFunctions(!!c)} />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("permissions.functions")}</Label>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("permissions.data")}</Label>
              <RadioGroup
                value=""
                onValueChange={(v) => setGlobalDataScope(v)}
                className="flex flex-col gap-1.5 mt-1.5"
              >
                {getDataScopeOptions(t).map((o) => (
                  <div key={o.value} className="flex items-center gap-1">
                    <RadioGroupItem value={o.value} id={`global-${o.value}`} className="h-3 w-3" />
                    <Label htmlFor={`global-${o.value}`} className="text-xs text-muted-foreground">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          {/* Module cards — grouped by sidebar section */}
          <div className="space-y-5 px-1">
            {Array.from(new Set(MODULES_CONFIG.map((m) => m.group))).map((group) => {
              const groupModules = MODULES_CONFIG.filter((m) => m.group === group);
              return (
                <div key={group} className="space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                    {group}
                  </h3>
                  <div className="space-y-2">
                    {groupModules.map((mod) => {
                      const isExpanded = expanded[mod.module] ?? false;
                      const hasSubmodules = mod.submodules.length > 0;
                      const enabledCount = getEnabledSubCount(mod.module);
                      const totalSubs = mod.submodules.length;
                      const dataScope = getModuleDataScope(mod.module);
                      const moduleCheckState = getModuleCheckState(mod.module);

                      return (
                        <Collapsible
                          key={mod.module}
                          open={isExpanded}
                          onOpenChange={(o) => setExpanded((p) => ({ ...p, [mod.module]: o }))}
                        >
                          <div className="border border-border rounded-lg bg-muted/30">
                            {/* Summary row */}
                            <div className="px-4 py-3">
                              <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 items-center">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={moduleCheckState}
                                    onCheckedChange={() => toggleModule(mod.module)}
                                  />
                                  <span className="text-sm font-semibold">{mod.module}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {hasSubmodules ? `${enabledCount}/${totalSubs} ${t("permissions.functionsCount")}` : "—"}
                                </span>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {getDataScopeLabels(t)[dataScope] || t("permissions.allData")}
                                  </span>
                                  {hasSubmodules ? (
                                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer ml-2">
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </CollapsibleTrigger>
                                  ) : (
                                    <span className="ml-2 w-4" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Expanded details */}
                            <CollapsibleContent>
                              <div className="border-t border-border px-4 py-3">
                                <div className="grid grid-cols-[1fr_1fr] gap-4">
                                  {/* Left: submodules */}
                                  <div className="space-y-2">
                                    {hasSubmodules ? (
                                      mod.submodules.map((sub) => {
                                        const key = getKey(mod.module, sub);
                                        return (
                                          <div key={key} className="flex items-center gap-2">
                                            <Checkbox
                                              checked={state[key]?.can_access ?? false}
                                              onCheckedChange={() => toggleSub(mod.module, key)}
                                            />
                                            <span className="text-sm">{sub}</span>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <p className="text-xs text-muted-foreground">{t("permissions.noSubfunctions")}</p>
                                    )}
                                  </div>
                                  {/* Right: data scope radio */}
                                  <div>
                                    <RadioGroup
                                      value={dataScope}
                                      onValueChange={(v) => setModuleDataScope(mod.module, v)}
                                      className="space-y-2"
                                    >
                                      {getDataScopeOptions(t).map((o) => (
                                        <div key={o.value} className="flex items-center gap-2">
                                          <RadioGroupItem value={o.value} id={`${mod.module}-${o.value}`} className="h-3.5 w-3.5" />
                                          <Label htmlFor={`${mod.module}-${o.value}`} className="text-sm">{o.label}</Label>
                                        </div>
                                      ))}
                                    </RadioGroup>
                                  </div>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? t("permissions.saving") : t("permissions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetPermissionsModal;
