import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import {
  useChatterProfiles,
  useChatterVaultByProfile,
} from "@/hooks/useChatterEvaluator";
import { VaultGallery } from "./VaultGallery";
import type { ChatterProfile } from "./types";

interface BilingualField {
  label: string;
  es: string | null;
  en: string | null;
}

const buildBilingualFields = (p: ChatterProfile): BilingualField[] => [
  { label: "Nacionalidad",   es: p.nationality, en: p.nationality_en },
  { label: "Ubicación",      es: p.location,    en: p.location_en },
  { label: "Edad",           es: p.age,         en: p.age_en },
  { label: "Saludo",         es: p.greeting,    en: p.greeting_en },
  { label: "Trato a usuarios", es: p.users_term, en: p.users_term_en },
  { label: "Cuerpo",         es: p.body,        en: p.body_en },
  { label: "Desnudez",       es: p.nudity,      en: p.nudity_en },
  { label: "Anal",           es: p.anal,        en: p.anal_en },
  { label: "Colaboraciones", es: p.collabs,     en: p.collabs_en },
  { label: "Videollamadas",  es: p.videocall,   en: p.videocall_en },
  { label: "Customs",        es: p.custom,      en: p.custom_en },
  { label: "Reglas extra",   es: p.extra,       en: p.extra_en },
];

const FieldRow = ({ field }: { field: BilingualField }) => {
  if (!field.es && !field.en) return null;
  return (
    <div className="grid grid-cols-1 gap-2 border-b py-3 last:border-0 md:grid-cols-[160px_1fr_1fr]">
      <div className="text-sm font-medium text-muted-foreground">{field.label}</div>
      <div className="text-sm whitespace-pre-wrap">
        <Badge variant="outline" className="mr-1 text-[10px]">ES</Badge>
        {field.es || <span className="text-muted-foreground italic">(vacío)</span>}
      </div>
      <div className="text-sm whitespace-pre-wrap">
        <Badge variant="outline" className="mr-1 text-[10px]">EN</Badge>
        {field.en || <span className="text-muted-foreground italic">(vacío)</span>}
      </div>
    </div>
  );
};

const ChatterProfileDetailContent = () => {
  const { profileKey } = useParams<{ profileKey: string }>();
  const profilesQ = useChatterProfiles();
  const profile = useMemo(
    () => profilesQ.data?.find((p) => p.key === profileKey) ?? null,
    [profilesQ.data, profileKey]
  );
  const vaultQ = useChatterVaultByProfile(profile?.id);

  if (profilesQ.isLoading) {
    return <main className="flex-1 p-6"><p className="text-sm text-muted-foreground">Cargando…</p></main>;
  }

  if (!profile) {
    return (
      <main className="flex-1 p-6">
        <Card className="p-6">
          <p className="text-sm">Perfil no encontrado: <code>{profileKey}</code></p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to="/chatter-evaluator"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Link>
          </Button>
        </Card>
      </main>
    );
  }

  const fields = buildBilingualFields(profile);
  const prices = Object.entries(profile.prices ?? {});
  const items = vaultQ.data ?? [];

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/chatter-evaluator"><ArrowLeft className="mr-2 h-4 w-4" /> Perfiles</Link>
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link to={`/chatter-evaluator/${profile.key}/edit`}>
              <Pencil className="h-4 w-4" /> Editar perfil
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div className="aspect-square w-48 overflow-hidden rounded-xl bg-muted">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.name}
                className="h-full w-full object-cover"
                style={{
                  objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                  transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
                }}
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{profile.name}</h1>
              {profile.name_en && profile.name_en !== profile.name && (
                <p className="text-sm text-muted-foreground">EN: {profile.name_en}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.location && <Badge variant="secondary">{profile.location}</Badge>}
              {profile.nationality && <Badge variant="secondary">{profile.nationality}</Badge>}
              {profile.age && <Badge variant="secondary">{profile.age}</Badge>}
              <Badge variant="outline" className="font-mono text-xs">key: {profile.key}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Creado: {new Date(profile.created_at).toLocaleDateString()} · Actualizado:{" "}
              {new Date(profile.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Personaje y reglas</h2>
            <div className="space-y-0">
              {fields.map((f) => <FieldRow key={f.label} field={f} />)}
            </div>
          </CardContent>
        </Card>

        {prices.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Catálogo de precios ({prices.length})</h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {prices.map(([service, price]) => (
                  <div
                    key={service}
                    className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <span className="truncate text-sm font-medium">{service}</span>
                    <span className="ml-2 shrink-0 text-sm text-muted-foreground">{price}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Vault ({vaultQ.isLoading ? "…" : items.length})
            </h2>
          </div>
          {vaultQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando vault…</p>
          ) : (
            <VaultGallery items={items} />
          )}
        </div>

        {profile.extra_fields && Object.keys(profile.extra_fields).length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                Campos adicionales
                <ExternalLink className="ml-1 inline h-3 w-3" />
              </h2>
              <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(profile.extra_fields, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
};

export default ChatterProfileDetailContent;
