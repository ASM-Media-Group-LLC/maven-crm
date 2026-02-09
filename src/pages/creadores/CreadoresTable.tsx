import { useState } from "react";
import { ArrowUpDown, Instagram, MoreHorizontal } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CreatorWithBusiness } from "./useCreadores";

const statusVariant: Record<string, string> = {
  active: "bg-success/20 text-success border-success/30",
  onboarding: "bg-primary/20 text-primary border-primary/30",
  leaving: "bg-destructive/20 text-destructive border-destructive/30",
  terminated: "bg-muted text-muted-foreground border-border",
  paused: "bg-warning/20 text-warning border-warning/30",
};

type SortKey = "name" | "category" | "status" | "country" | "agency";

interface Props {
  creators: CreatorWithBusiness[];
}

const CreadoresTable = ({ creators }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortHeader label="Creador" col="name" /></TableHead>
          <TableHead><SortHeader label="Categoría" col="category" /></TableHead>
          <TableHead><SortHeader label="Estado" col="status" /></TableHead>
          <TableHead><SortHeader label="Ubicación" col="country" /></TableHead>
          <TableHead><SortHeader label="Agencia" col="agency" /></TableHead>
          <TableHead>Redes</TableHead>
          <TableHead className="w-10" />
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

          return (
            <TableRow key={c.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
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
                  <Badge variant="secondary" className="font-normal">
                    {c.category}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {c.status && (
                  <Badge
                    variant="outline"
                    className={`capitalize ${statusVariant[c.status] ?? ""}`}
                  >
                    {c.status}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {[c.city, c.country].filter(Boolean).join(", ")}
              </TableCell>
              <TableCell className="text-sm">
                {c.creator_business?.assigned_agency ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {c.instagram_handle && (
                    <a
                      href={`https://instagram.com/${c.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Instagram className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Ver perfil</DropdownMenuItem>
                    <DropdownMenuItem>Editar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
  );
};

export default CreadoresTable;
