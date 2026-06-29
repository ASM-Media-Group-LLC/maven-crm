import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Copy, Menu as MenuIcon, MousePointerClick, Database } from "lucide-react";
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

const getKey = (mod: string, sub: string | null) => (sub ? `${mod}::${sub}` : mod);

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
    // new sub-keys: they pick up whatever the parent had instead of
    // silently defaulting to off.
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
  const allSubtabKeys = useMemo(
    () => MODULES_CONFIG.flatMap((m) => m.subtabs.map((s) => getKey(m.module, s.name))),
    [],
  );
  const allFunctionKeys = useMemo(
    () => MODULES_CONFIG.flatMap((m) => m.functions.map((f) => getKey(m.module, f))),
    [],
  );
  const allKeys = useMemo(
    () => [...allModuleKeys, ...allSubtabKeys, ...allFunctionKeys],
    [allModuleKeys, allSubtabKeys, allFunctionKeys],
  );

  // "Menús" master = every module + every navigable subtab.
  const allMenusChecked = useMemo(
    () => [...allModuleKeys, ...allSubtabKeys].every((k) => state[k]?.can_access),
    [state, allModuleKeys, allSubtabKeys],
  );
  // "Funciones" master = every action permission.
  const allFunctionsChecked = useMemo(
    () => allFunctionKeys.length > 0 && allFunctionKeys.every((k) => state[k]?.can_access),
    [state, allFunctionKeys],
  );

  const toggleAllMenus = (checked: boolean) => {
    setState((prev) => {
      const next = { ...prev };
      [...allModuleKeys, ...allSubtabKeys].forEach((k) => {
        next[k] = { ...next[k], can_access: checked };
      });
      return next;
    });
  };

  const toggleAllFunctions = (checked: boolean) => {
    setState((prev) => {
      const next = { ...prev };
      allFunctionKeys.forEach((k) => { next[k] = { ...next[k], can_access: checked }; });
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

  // Toggle module + cascade to all its submodules (subtabs AND functions),
  // preserving the long-standing behaviour. When everything is on → turn it
  // all off; otherwise turn it all on.
  const toggleModule = (mod: string) => {
    setState((prev) => {
      const next = { ...prev };
      const moduleKey = getKey(mod, null);
      const cfg = MODULES_CONFIG.find((m) => m.module === mod);
      const subs = cfg?.submodules ?? [];
      const allSubsOn = subs.length > 0 && subs.every((s) => prev[getKey(mod, s)]?.can_access);
      const moduleOn = prev[moduleKey]?.can_access;
      const newVal = !(moduleOn && (subs.length === 0 || allSubsOn));
      next[moduleKey] = { ...next[moduleKey], can_access: newVal };
      subs.forEach((sub) => {
        const k = getKey(mod, sub);
        next[k] = { ...next[k], can_access: newVal };
      });
      return next;
    });
  };

  // Toggle a single submodule (subtab or function) and re-derive the parent
  // module: if any submodule is on, the module reads as "active" (so the
  // sidebar still shows it); if every submodule is off, the module is off.
  const toggleSub = (mod: string, key: string) => {
    setState((prev) => {
      const next = { ...prev, [key]: { ...prev[key], can_access: !prev[key]?.can_access } };
      const cfg = MODULES_CONFIG.find((m) => m.module === mod);
      if (cfg && cfg.submodules.length > 0) {
        const moduleKey = getKey(mod, null);
        const anySubOn = cfg.submodules.some((sub) => next[getKey(mod, sub)]?.can_access);
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

  const getModuleDataScope = (mod: string): string => state[getKey(mod, null)]?.data_scope ?? "all";

  const getEnabledSubtabCount = (mod: string): number => {
    const cfg = MODULES_CONFIG.find((m) => m.module === mod);
    if (!cfg) return 0;
    return cfg.subtabs.filter((s) => state[getKey(mod, s.name)]?.can_access).length;
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

  // Small reusable checkbox + label cell.
  const CheckRow = ({
    checked,
    onToggle,
    label,
    className = "",
    muted = false,
  }: {
    checked: boolean | "indeterminate";
    onToggle: () => void;
    label: string;
    className?: string;
    muted?: boolean;
  }) => (
    <label className={`flex items-center gap-2 cursor-pointer select-none ${className}`}>
      <Checkbox checked={checked} onCheckedChange={onToggle} className="h-4 w-4" />
      <span className={`text-sm leading-tight ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[88vh]">
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
                  <Button variant="outline" size="sm" className="gap-2 shrink-0" disabled={copyingFrom}>
                    <Copy className="h-3.5 w-3.5" />
                    {copyingFrom ? "Copiando…" : "Copiar de otro rol"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {copyableRoles.map((r) => (
                    <DropdownMenuItem key={r.id} onClick={() => handleCopyFrom(r.id, r.name)} className="capitalize">
                      {r.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </DialogHeader>

        {/* Sticky column header — the 3 BLU columns + master toggles */}
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1.55fr)_minmax(0,1fr)] gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => toggleAllMenus(!allMenusChecked)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/80 hover:text-foreground"
            >
              <Checkbox checked={allMenusChecked} className="h-4 w-4" />
              <MenuIcon className="h-3.5 w-3.5" /> {t("permissions.menus")}
            </button>
            <p className="pl-6 text-[11px] text-muted-foreground">{t("permissions.menusHint")}</p>
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => toggleAllFunctions(!allFunctionsChecked)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/80 hover:text-foreground"
            >
              <Checkbox checked={allFunctionsChecked} className="h-4 w-4" />
              <MousePointerClick className="h-3.5 w-3.5" /> {t("permissions.functions")}
            </button>
            <p className="pl-6 text-[11px] text-muted-foreground">{t("permissions.functionsHint")}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/80">
              <Database className="h-3.5 w-3.5" /> {t("permissions.data")}
            </div>
            <RadioGroup value="" onValueChange={(v) => setGlobalDataScope(v)} className="flex flex-col gap-1 pl-1">
              {getDataScopeOptions(t).map((o) => (
                <div key={o.value} className="flex items-center gap-1.5">
                  <RadioGroupItem value={o.value} id={`global-${o.value}`} className="h-3 w-3" />
                  <Label htmlFor={`global-${o.value}`} className="text-[11px] text-muted-foreground cursor-pointer">{o.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <ScrollArea className="h-[56vh] pr-2">
          <div className="space-y-5 px-0.5 pt-1">
            {Array.from(new Set(MODULES_CONFIG.map((m) => m.group))).map((group) => {
              const groupModules = MODULES_CONFIG.filter((m) => m.group === group);
              return (
                <div key={group} className="space-y-1.5">
                  <h3 className="px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    {group}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {groupModules.map((mod, idx) => {
                      const isExpanded = expanded[mod.module] ?? false;
                      const topSubtabs = mod.subtabs.filter((s) => !s.parent);
                      const childrenOf = (parent: string) => mod.subtabs.filter((s) => s.parent === parent);
                      const hasSubtabs = mod.subtabs.length > 0;
                      const hasFunctions = mod.functions.length > 0;
                      const enabledSubtabs = getEnabledSubtabCount(mod.module);
                      const dataScope = getModuleDataScope(mod.module);
                      const moduleCheckState = getModuleCheckState(mod.module);

                      return (
                        <div key={mod.module} className={idx > 0 ? "border-t border-border" : ""}>
                          {/* Module row: Menús | Funciones | Datos */}
                          <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1.55fr)_minmax(0,1fr)] gap-4 items-start px-4 py-3 hover:bg-muted/20">
                            {/* Col 1 — Menús */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              {hasSubtabs ? (
                                <button
                                  type="button"
                                  onClick={() => setExpanded((p) => ({ ...p, [mod.module]: !isExpanded }))}
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                  aria-label={t("permissions.expandSubtabs")}
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              <Checkbox
                                checked={moduleCheckState}
                                onCheckedChange={() => toggleModule(mod.module)}
                                className="h-4 w-4 shrink-0"
                              />
                              <span className="truncate text-sm font-semibold">{mod.module}</span>
                              {hasSubtabs && (
                                <span className="ml-1 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {enabledSubtabs}/{mod.subtabs.length}
                                </span>
                              )}
                            </div>

                            {/* Col 2 — Permisos de función */}
                            <div className="min-w-0">
                              {hasFunctions ? (
                                <div className="flex flex-col gap-1.5">
                                  {mod.functions.map((fn) => {
                                    const key = getKey(mod.module, fn);
                                    return (
                                      <CheckRow
                                        key={key}
                                        checked={state[key]?.can_access ?? false}
                                        onToggle={() => toggleSub(mod.module, key)}
                                        label={fn}
                                      />
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/60">—</span>
                              )}
                            </div>

                            {/* Col 3 — Permisos de datos */}
                            <div>
                              <RadioGroup
                                value={dataScope}
                                onValueChange={(v) => setModuleDataScope(mod.module, v)}
                                className="flex flex-col gap-1"
                              >
                                {getDataScopeOptions(t).map((o) => (
                                  <div key={o.value} className="flex items-center gap-1.5">
                                    <RadioGroupItem value={o.value} id={`${mod.module}-${o.value}`} className="h-3.5 w-3.5" />
                                    <Label htmlFor={`${mod.module}-${o.value}`} className="text-xs cursor-pointer">{o.label}</Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>
                          </div>

                          {/* Expanded subtab tree (Menús column only) */}
                          {isExpanded && hasSubtabs && (
                            <div className="border-t border-dashed border-border/60 bg-muted/10 px-4 py-2.5">
                              <div className="space-y-1.5">
                                {topSubtabs.map((st) => {
                                  const stKey = getKey(mod.module, st.name);
                                  const kids = childrenOf(st.name);
                                  return (
                                    <div key={stKey} className="space-y-1.5">
                                      <CheckRow
                                        checked={state[stKey]?.can_access ?? false}
                                        onToggle={() => toggleSub(mod.module, stKey)}
                                        label={st.name}
                                        className="pl-6"
                                      />
                                      {kids.map((kid) => {
                                        const kidKey = getKey(mod.module, kid.name);
                                        // strip the "Parent: " / "Chatters: " prefix for display when present
                                        const label = kid.name.includes(": ") ? kid.name.split(": ").slice(1).join(": ") : kid.name;
                                        return (
                                          <CheckRow
                                            key={kidKey}
                                            checked={state[kidKey]?.can_access ?? false}
                                            onToggle={() => toggleSub(mod.module, kidKey)}
                                            label={label}
                                            className="pl-12"
                                            muted
                                          />
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
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
