import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import InstagramIcon from "@/components/icons/InstagramIcon";
import type { Contacto } from "./ContactosContent";

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  Nuevo: "primary-soft",
  Contactado: "warning-soft",
  Convertido: "success-soft",
  Descartado: "destructive-soft",
};

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

interface Props {
  contactos: Contacto[];
}

const ContactosGrid = ({ contactos }: Props) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {contactos.map((c) => {
        const initials = c.nombre
          .split(" ")
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase();

        return (
          <Card
            key={c.id}
            className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.ticket}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={statusVariant[c.estado] ?? "secondary-soft"} className="text-[10px] px-1.5 py-0">
                      {c.estado}
                    </Badge>
                    <Badge variant={categoryVariant[c.categoria] ?? "secondary-soft"} className="text-[10px] px-1.5 py-0">
                      {c.categoria}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{c.pais}</p>
                <a
                  href={`https://instagram.com/${c.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <InstagramIcon className="h-4 w-4" />
                  <span className="truncate">@{c.instagram}</span>
                </a>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {contactos.length === 0 && (
        <p className="col-span-full py-12 text-center text-muted-foreground">
          No se encontraron contactos.
        </p>
      )}
    </div>
  );
};

export default ContactosGrid;
