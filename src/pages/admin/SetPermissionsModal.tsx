import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

const SetPermissionsModal = ({ open, onOpenChange, roleId, roleName }: SetPermissionsModalProps) => {
  const { permissions, isLoading, savePermissions, isSaving } = useRolePermissions(roleId);
  const [state, setState] = useState<PermState>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Build initial state from permissions
  useEffect(() => {
    if (!open) return;
    const s: PermState = {};
    // Initialize all modules/submodules as unchecked
    MODULES_CONFIG.forEach((m) => {
      if (m.submodules.length === 0) {
        s[getKey(m.module, null)] = { can_access: false, data_scope: "all" };
      } else {
        m.submodules.forEach((sub) => {
          s[getKey(m.module, sub)] = { can_access: false, data_scope: "all" };
        });
      }
    });
    // Override with existing permissions
    permissions.forEach((p) => {
      const key = getKey(p.module, p.submodule);
      s[key] = { can_access: p.can_access, data_scope: p.data_scope };
    });
    setState(s);
  }, [permissions, open]);

  const allMenuChecked = useMemo(() => {
    const keys = Object.keys(state);
    return keys.length > 0 && keys.every((k) => state[k].can_access);
  }, [state]);

  const toggleAll = (checked: boolean) => {
    setState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { next[k] = { ...next[k], can_access: checked }; });
      return next;
    });
  };

  const toggle = (key: string) => {
    setState((prev) => ({
      ...prev,
      [key]: { ...prev[key], can_access: !prev[key]?.can_access },
    }));
  };

  const setDataScope = (key: string, scope: string) => {
    setState((prev) => ({
      ...prev,
      [key]: { ...prev[key], data_scope: scope },
    }));
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
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Configurar Permisos — <span className="capitalize">{roleName}</span></DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[55vh] pr-4">
          {/* Global toggles */}
          <div className="flex items-center gap-6 pb-4 border-b mb-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allMenuChecked}
                onCheckedChange={(c) => toggleAll(!!c)}
              />
              <Label className="text-sm font-medium">Todos los módulos</Label>
            </div>
          </div>

          <div className="space-y-1">
            {MODULES_CONFIG.map((mod) => {
              const hasSubmodules = mod.submodules.length > 0;
              const isExpanded = expanded[mod.module] ?? false;

              if (!hasSubmodules) {
                const key = getKey(mod.module, null);
                return (
                  <div key={mod.module} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={state[key]?.can_access ?? false}
                        onCheckedChange={() => toggle(key)}
                      />
                      <span className="text-sm font-medium">{mod.module}</span>
                    </div>
                    <RadioGroup
                      value={state[key]?.data_scope ?? "all"}
                      onValueChange={(v) => setDataScope(key, v)}
                      className="flex gap-3"
                    >
                      {[{ value: "all", label: "Todos" }, { value: "subordinates", label: "Subordinados" }, { value: "self", label: "Propios" }].map((o) => (
                        <div key={o.value} className="flex items-center gap-1">
                          <RadioGroupItem value={o.value} id={`${key}-${o.value}`} className="h-3 w-3" />
                          <Label htmlFor={`${key}-${o.value}`} className="text-xs text-muted-foreground">{o.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                );
              }

              const subKeys = mod.submodules.map((s) => getKey(mod.module, s));
              const allSubChecked = subKeys.every((k) => state[k]?.can_access);
              const someSubChecked = subKeys.some((k) => state[k]?.can_access);

              return (
                <Collapsible key={mod.module} open={isExpanded} onOpenChange={(o) => setExpanded((p) => ({ ...p, [mod.module]: o }))}>
                  <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allSubChecked}
                        // @ts-ignore
                        indeterminate={someSubChecked && !allSubChecked}
                        onCheckedChange={(c) => {
                          setState((prev) => {
                            const next = { ...prev };
                            subKeys.forEach((k) => { next[k] = { ...next[k], can_access: !!c }; });
                            return next;
                          });
                        }}
                      />
                      <CollapsibleTrigger className="flex items-center gap-1">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="text-sm font-medium">{mod.module}</span>
                      </CollapsibleTrigger>
                      <span className="text-xs text-muted-foreground">
                        ({subKeys.filter((k) => state[k]?.can_access).length}/{subKeys.length})
                      </span>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="ml-10 space-y-1 pb-2">
                      {mod.submodules.map((sub) => {
                        const key = getKey(mod.module, sub);
                        return (
                          <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-muted/30">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={state[key]?.can_access ?? false}
                                onCheckedChange={() => toggle(key)}
                              />
                              <span className="text-sm">{sub}</span>
                            </div>
                            <RadioGroup
                              value={state[key]?.data_scope ?? "all"}
                              onValueChange={(v) => setDataScope(key, v)}
                              className="flex gap-3"
                            >
                              {[{ value: "all", label: "Todos" }, { value: "subordinates", label: "Subordinados" }, { value: "self", label: "Propios" }].map((o) => (
                                <div key={o.value} className="flex items-center gap-1">
                                  <RadioGroupItem value={o.value} id={`${key}-${o.value}`} className="h-3 w-3" />
                                  <Label htmlFor={`${key}-${o.value}`} className="text-xs text-muted-foreground">{o.label}</Label>
                                </div>
                              ))}
                            </RadioGroup>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
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
