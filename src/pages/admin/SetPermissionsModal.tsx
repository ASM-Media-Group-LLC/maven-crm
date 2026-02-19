import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRolePermissions, MODULES_CONFIG, type RolePermission } from "./useRoles";

interface SetPermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string | null;
  roleName: string;
}

type PermState = Record<string, { can_access: boolean; data_scope: string }>;

const getKey = (mod: string, sub: string | null) => sub ? `${mod}::${sub}` : mod;

const DATA_SCOPE_LABELS: Record<string, string> = {
  all: "All data",
  subordinates: "Self and subordinates",
  self: "Data about self",
};

const DATA_SCOPE_OPTIONS = [
  { value: "all", label: "All data" },
  { value: "subordinates", label: "Self and subordinates" },
  { value: "self", label: "Data about self" },
];

const SetPermissionsModal = ({ open, onOpenChange, roleId, roleName }: SetPermissionsModalProps) => {
  const { permissions, isLoading, savePermissions, isSaving } = useRolePermissions(roleId);
  const [state, setState] = useState<PermState>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const isAdminRole = roleName.toLowerCase() === "admin";

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

  // Toggle module + cascade to all its submodules
  const toggleModule = (mod: string) => {
    setState((prev) => {
      const next = { ...prev };
      const moduleKey = getKey(mod, null);
      const newVal = !next[moduleKey]?.can_access;
      next[moduleKey] = { ...next[moduleKey], can_access: newVal };
      const cfg = MODULES_CONFIG.find((m) => m.module === mod);
      cfg?.submodules.forEach((sub) => {
        const k = getKey(mod, sub);
        next[k] = { ...next[k], can_access: newVal };
      });
      return next;
    });
  };

  const toggleSub = (key: string) => {
    setState((prev) => ({
      ...prev,
      [key]: { ...prev[key], can_access: !prev[key]?.can_access },
    }));
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
          <DialogTitle>
            Set permissions for <span className="font-bold capitalize">{roleName}</span>
          </DialogTitle>
          <DialogDescription>Configure granular permissions for this role</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[58vh] pr-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 pb-3 border-b border-border mb-4 px-1">
            <div className="flex items-center gap-2">
              <Checkbox checked={allMenusChecked} onCheckedChange={(c) => toggleAllMenus(!!c)} />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Menus</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={allFunctionsChecked} onCheckedChange={(c) => toggleAllFunctions(!!c)} />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Function permissions</Label>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data permissions</Label>
              <RadioGroup
                value=""
                onValueChange={(v) => setGlobalDataScope(v)}
                className="flex flex-col gap-1.5 mt-1.5"
              >
                {DATA_SCOPE_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-1">
                    <RadioGroupItem value={o.value} id={`global-${o.value}`} className="h-3 w-3" />
                    <Label htmlFor={`global-${o.value}`} className="text-xs text-muted-foreground">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          {/* Module cards */}
          <div className="space-y-3 px-1">
            {MODULES_CONFIG.map((mod) => {
              const moduleKey = getKey(mod.module, null);
              const isExpanded = expanded[mod.module] ?? false;
              const hasSubmodules = mod.submodules.length > 0;
              const enabledCount = getEnabledSubCount(mod.module);
              const totalSubs = mod.submodules.length;
              const dataScope = getModuleDataScope(mod.module);

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
                            checked={state[moduleKey]?.can_access ?? false}
                            onCheckedChange={() => toggleModule(mod.module)}
                          />
                          <span className="text-sm font-semibold">{mod.module}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {hasSubmodules ? `${enabledCount}/${totalSubs} funciones` : "—"}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {DATA_SCOPE_LABELS[dataScope] || "All data"}
                          </span>
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer ml-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </CollapsibleTrigger>
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
                                      onCheckedChange={() => toggleSub(key)}
                                    />
                                    <span className="text-sm">{sub}</span>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No functions available</p>
                            )}
                          </div>
                          {/* Right: data scope radio */}
                          <div>
                            <RadioGroup
                              value={dataScope}
                              onValueChange={(v) => setModuleDataScope(mod.module, v)}
                              className="space-y-2"
                            >
                              {DATA_SCOPE_OPTIONS.map((o) => (
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
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "Guardando..." : "Guardar Permisos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetPermissionsModal;
