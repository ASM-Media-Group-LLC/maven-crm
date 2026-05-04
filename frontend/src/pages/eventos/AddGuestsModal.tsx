import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Users, UserPlus, Contact } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";

export interface LocalGuest {
  type: "creator" | "contact" | "external";
  creator_id?: string;
  guest_name: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  youtube?: string;
  billing?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (guests: LocalGuest[]) => void;
  existingCreatorIds: string[];
}

const statusLabel: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  pending: "Pendiente",
  paused: "Pausada",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  inactive: "destructive",
  pending: "secondary",
  paused: "outline",
};

const AVATAR_COLORS = [
  "bg-primary/20 text-primary",
  "bg-accent/60 text-accent-foreground",
  "bg-muted text-muted-foreground",
  "bg-secondary text-secondary-foreground",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type Tab = "creadoras" | "contactos" | "externo";

const AddGuestsModal = ({ open, onOpenChange, onConfirm, existingCreatorIds }: Props) => {
  const [tab, setTab] = useState<Tab>("creadoras");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // External form
  const [extName, setExtName] = useState("");
  const [extIG, setExtIG] = useState("");
  const [extTT, setExtTT] = useState("");
  const [extTW, setExtTW] = useState("");
  const [extYT, setExtYT] = useState("");
  const [extBilling, setExtBilling] = useState("");

  const { data: creators = [] } = useQuery({
    queryKey: ["creators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name, instagram_handle, status, profile_photo_url")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const filtered = creators.filter((c) => {
    if (existingCreatorIds.includes(c.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.artistic_name?.toLowerCase().includes(q)) ||
      (c.instagram_handle?.toLowerCase().includes(q))
    );
  });

  const toggleCreator = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmCreators = () => {
    const guests: LocalGuest[] = creators
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({
        type: "creator" as const,
        creator_id: c.id,
        guest_name: c.artistic_name || c.name,
        instagram: c.instagram_handle ?? undefined,
      }));
    onConfirm(guests);
    setSelectedIds(new Set());
    setSearch("");
  };

  const handleAddExternal = () => {
    if (!extName.trim()) return;
    onConfirm([{
      type: "external",
      guest_name: extName.trim(),
      instagram: extIG || undefined,
      tiktok: extTT || undefined,
      twitter: extTW || undefined,
      youtube: extYT || undefined,
      billing: extBilling ? parseFloat(extBilling) : undefined,
    }]);
    setExtName(""); setExtIG(""); setExtTT(""); setExtTW(""); setExtYT(""); setExtBilling("");
  };

  const resetAndClose = () => {
    setSelectedIds(new Set());
    setSearch("");
    onOpenChange(false);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "creadoras", label: "Creadoras", icon: <Users className="h-4 w-4" /> },
    { key: "contactos", label: "Contactos", icon: <Contact className="h-4 w-4" /> },
    { key: "externo", label: "Externo", icon: <UserPlus className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Agregar Invitados</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="inline-flex items-center rounded-lg bg-muted p-1 gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "creadoras" && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar creadoras..."
                className="pl-9"
              />
            </div>
            <div className="flex-1 overflow-auto min-h-0 max-h-[40vh] space-y-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No se encontraron creadoras</p>
              ) : (
                filtered.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleCreator(c.id)}
                    />
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${getAvatarColor(c.name)}`}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.artistic_name || c.name}</p>
                      {c.instagram_handle && (
                        <p className="text-xs text-muted-foreground truncate">@{c.instagram_handle}</p>
                      )}
                    </div>
                    {c.status && (
                      <Badge variant={statusVariant[c.status] ?? "secondary"} className="text-[10px]">
                        {statusLabel[c.status] ?? c.status}
                      </Badge>
                    )}
                  </label>
                ))
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} creadora(s) seleccionada(s)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetAndClose}>Cancelar</Button>
                <Button size="sm" onClick={handleConfirmCreators} disabled={selectedIds.size === 0}>Confirmar</Button>
              </div>
            </div>
          </div>
        )}

        {tab === "contactos" && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
              <Contact className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="text-sm font-semibold">No hay contactos registrados</h4>
            <p className="text-xs text-muted-foreground max-w-xs">
              La funcionalidad de contactos estará disponible próximamente. Por ahora puedes agregar invitados como creadoras o externos.
            </p>
          </div>
        )}

        {tab === "externo" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={extName} onChange={(e) => setExtName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><InstagramIcon className="h-3 w-3" /> Instagram</Label>
                <Input value={extIG} onChange={(e) => setExtIG(e.target.value)} placeholder="@usuario" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><TikTokIcon className="h-3 w-3" /> TikTok</Label>
                <Input value={extTT} onChange={(e) => setExtTT(e.target.value)} placeholder="@usuario" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><XIcon className="h-3 w-3" /> X / Twitter</Label>
                <Input value={extTW} onChange={(e) => setExtTW(e.target.value)} placeholder="@usuario" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">YouTube</Label>
                <Input value={extYT} onChange={(e) => setExtYT(e.target.value)} placeholder="Canal" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Facturación Promedio ($/mes)</Label>
              <Input type="number" value={extBilling} onChange={(e) => setExtBilling(e.target.value)} placeholder="0.00" min={0} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={resetAndClose}>Cancelar</Button>
              <Button size="sm" onClick={handleAddExternal} disabled={!extName.trim()}>
                <UserPlus className="mr-1 h-4 w-4" /> Agregar y Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddGuestsModal;
