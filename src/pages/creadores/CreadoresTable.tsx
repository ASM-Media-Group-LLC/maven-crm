import { useState } from "react";
import { ArrowUpDown, Instagram, Building2, RefreshCw, Pencil, Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CreatorWithBusiness } from "./useCreadores";
import EditCreadorModal from "./EditCreadorModal";

const statusLabel: Record<string, string> = {
  active: "Activa",
  onboarding: "Onboarding",
  leaving: "Retiro",
  terminated: "Terminada",
  paused: "Pausada",
};

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  active: "success-soft",
  onboarding: "primary-soft",
  leaving: "warning-soft",
  terminated: "destructive-soft",
  paused: "secondary-soft",
};

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

const getFlagEmoji = (countryCode: string | null) => {
  if (!countryCode) return "";
  return countryCode
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
};

type SortKey = "name" | "category" | "status" | "country" | "agency";

interface Props {
  creators: CreatorWithBusiness[];
}

const CreadoresTable = ({ creators }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [editingCreator, setEditingCreator] = useState<CreatorWithBusiness | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...creators].sort((a, b) => {
    let va = "";
    let vb = "";
    switch (sortKey) {
      case "name":
        va = a.name;
        vb = b.name;
        break;
      case "category":
        va = a.category ?? "";
        vb = b.category ?? "";
        break;
      case "status":
        va = a.status ?? "";
        vb = b.status ?? "";
        break;
      case "country":
        va = `${a.country ?? ""} ${a.city ?? ""}`;
        vb = `${b.country ?? ""} ${b.city ?? ""}`;
        break;
      case "agency":
        va = a.creator_business?.assigned_agency ?? "";
        vb = b.creator_business?.assigned_agency ?? "";
        break;
    }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortHeader label="Creador" col="name" /></TableHead>
          <TableHead><SortHeader label="Categoría" col="category" /></TableHead>
          <TableHead><SortHeader label="Estado" col="status" /></TableHead>
          <TableHead><SortHeader label="Ubicación" col="country" /></TableHead>
          <TableHead><SortHeader label="Agencia" col="agency" /></TableHead>
          <TableHead>Redes</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((c) => {
          const initials = c.name
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase();

          const flag = getFlagEmoji(c.country_code);
          const agency = c.creator_business?.assigned_agency;
          const kashType = c.creator_business?.kash_type;
          const agencyLabel = [agency, kashType].filter(Boolean).join(" · ");

          return (
            <TableRow key={c.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {c.profile_photo_url && <AvatarImage src={c.profile_photo_url} />}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium leading-none">{c.artistic_name || c.name}</p>
                    {c.artistic_name && (
                      <p className="text-xs text-muted-foreground">{c.name}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {c.category && (
                  <Badge variant={categoryVariant[c.category] ?? "secondary-soft"} className="font-normal">
                    {c.category}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {c.status && (
                  <Badge variant={statusVariant[c.status] ?? "secondary-soft"}>
                    {statusLabel[c.status] ?? c.status}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {flag && <span className="mr-1">{flag}</span>}
                {c.city || c.country || "—"}
              </TableCell>
              <TableCell className="text-sm">
                {agencyLabel ? (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate max-w-[140px]">{agencyLabel}</span>
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {c.instagram_handle && (
                    <a
                      href={`https://instagram.com/${c.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Instagram className="h-4 w-4" />
                    </a>
                  )}
                  {c.tiktok_handle && (
                    <a
                      href={`https://tiktok.com/@${c.tiktok_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:text-muted-foreground text-xs font-bold"
                    >
                      TT
                    </a>
                  )}
                  {c.twitter_handle && (
                    <a
                      href={`https://twitter.com/${c.twitter_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:text-muted-foreground text-xs font-bold"
                    >
                      𝕏
                    </a>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingCreator(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
              No se encontraron creadores.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>

    {editingCreator && (
      <EditCreadorModal
        open={!!editingCreator}
        onOpenChange={(open) => { if (!open) setEditingCreator(null); }}
        creator={editingCreator}
      />
    )}
  </>
  );
};

export default CreadoresTable;
