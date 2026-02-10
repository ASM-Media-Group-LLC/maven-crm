import { useParams, useNavigate } from "react-router-dom";
import { differenceInCalendarDays, setYear } from "date-fns";
import { ArrowLeft, Phone, Cake } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSocialUrl, displayHandle } from "@/lib/utils";
import { useCreadorById } from "./useCreadores";
import InfoTabContent from "./InfoTabContent";
import LineamientosTabContent from "./LineamientosTabContent";
import RedesTabContent from "./RedesTabContent";

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

const countryToCode: Record<string, string> = {
  Argentina: "AR", Bolivia: "BO", Brasil: "BR", Chile: "CL", Colombia: "CO",
  "Costa Rica": "CR", Cuba: "CU", Ecuador: "EC", "El Salvador": "SV",
  España: "ES", "Estados Unidos": "US", Guatemala: "GT", Honduras: "HN",
  México: "MX", Nicaragua: "NI", Panamá: "PA", Paraguay: "PY", Perú: "PE",
  "Puerto Rico": "PR", "República Dominicana": "DO", Uruguay: "UY", Venezuela: "VE",
};

const getFlagEmoji = (code: string | null) => {
  if (!code) return "";
  return code.toUpperCase().split("").map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
};

function getDaysUntilBirthday(birthDate: string): number | null {
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let next = setYear(bd, today.getFullYear());
  if (next < today) next = setYear(bd, today.getFullYear() + 1);
  return differenceInCalendarDays(next, today);
}

function computeAge(birthDate: string): number | null {
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

const CreadorProfileContent = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: creator, isLoading } = useCreadorById(id ?? "");

  if (isLoading) {
    return (
      <main className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (!creator) {
    return (
      <main className="flex-1 p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/creadores")} className="gap-1.5 mb-4">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <p className="text-muted-foreground">Creadora no encontrada.</p>
      </main>
    );
  }

  const c = creator;
  const initials = c.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const flag = getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null);
  const age = c.birth_date ? computeAge(c.birth_date) : c.age;
  const birthdayDays = c.birth_date ? getDaysUntilBirthday(c.birth_date) : null;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/creadores")} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </div>

      <div className="mx-6 mt-3 h-32 rounded-xl bg-primary/80 -mb-16" />

      <div className="mx-6 relative z-10 rounded-xl bg-gradient-to-br from-card to-muted/50 border border-border p-6">
        <div className="flex items-start gap-6">
          <Avatar className="h-24 w-24 shrink-0">
            {c.profile_photo_url && <AvatarImage src={c.profile_photo_url} />}
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-wide uppercase">{c.name}</h1>
            {c.artistic_name && (
              <p className="text-muted-foreground text-sm">"{c.artistic_name}"</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {c.whatsapp_number && (
                <a href={`https://wa.me/${c.whatsapp_number}`} target="_blank" rel="noopener noreferrer">
                  <Badge variant="secondary-soft" className="gap-1.5 cursor-pointer hover:bg-muted">
                    <Phone className="h-3 w-3" /> WhatsApp
                  </Badge>
                </a>
              )}
              {c.instagram_handle && (
                <a href={buildSocialUrl("instagram", c.instagram_handle)} target="_blank" rel="noopener noreferrer">
                  <Badge variant="secondary-soft" className="gap-1.5 cursor-pointer hover:bg-muted">
                    <InstagramIcon className="h-3 w-3" /> {displayHandle(c.instagram_handle)}
                  </Badge>
                </a>
              )}
              {age != null && (
                <Badge variant="secondary-soft">{age} años</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {c.status && (
              <Badge variant={statusVariant[c.status] ?? "secondary-soft"}>
                {statusLabel[c.status] ?? c.status}
              </Badge>
            )}
            {birthdayDays != null && (
              <Badge variant="secondary-soft" className="gap-1">
                <Cake className="h-3 w-3" />
                {birthdayDays === 0 ? "¡Hoy!" : `${birthdayDays} días para su cumpleaños`}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 mt-4 pb-6">
        <Tabs defaultValue="info">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="lineamientos">Lineamientos</TabsTrigger>
            <TabsTrigger value="redes">Redes</TabsTrigger>
            <TabsTrigger value="monetizacion">Monetización</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="notas">Notas</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <InfoTabContent creator={c} creatorId={id!} />
          </TabsContent>

          <TabsContent value="lineamientos">
            <LineamientosTabContent creatorId={id!} />
          </TabsContent>

          <TabsContent value="redes">
            <RedesTabContent creator={c} creatorId={id!} />
          </TabsContent>

          {["monetizacion", "documentos", "notas", "tickets", "historial"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <p className="text-sm text-muted-foreground text-center py-12">Sin datos disponibles</p>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
};

export default CreadorProfileContent;
