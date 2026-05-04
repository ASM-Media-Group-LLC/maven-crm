import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Image as ImageIcon, Video, ListChecks, Mail, Settings } from "lucide-react";
import {
  useChatterProfiles,
  useChatterVaultCounts,
  useChatterCriteria,
  useChatterConfig,
  useChatterSessions,
} from "@/hooks/useChatterEvaluator";
import type { ChatterProfile } from "./types";
import { NewSessionDialog } from "./NewSessionDialog";

const ProfileCard = ({
  profile,
  vaultCount,
}: {
  profile: ChatterProfile;
  vaultCount: number;
}) => {
  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <Link
      to={`/chatter-evaluator/${profile.key}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card className="overflow-hidden transition-colors hover:border-primary/40">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.name}
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-muted-foreground">
              {initials}
            </div>
          )}
        </div>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{profile.name}</h3>
              {profile.location && (
                <p className="truncate text-xs text-muted-foreground">
                  {profile.location}
                  {profile.age ? ` · ${profile.age}` : ""}
                </p>
              )}
            </div>
            <Badge variant="secondary" className="shrink-0">
              <ImageIcon className="mr-1 h-3 w-3" />
              {vaultCount}
            </Badge>
          </div>
          {profile.nationality && (
            <p className="text-xs text-muted-foreground">{profile.nationality}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ImageIcon;
  label: string;
  value: string | number;
}) => (
  <Card>
    <CardContent className="flex items-center gap-3 p-4">
      <div className="rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </CardContent>
  </Card>
);

const ChatterEvaluatorContent = () => {
  const profilesQ = useChatterProfiles();
  const vaultCountsQ = useChatterVaultCounts();
  const criteriaQ = useChatterCriteria();
  const configQ = useChatterConfig();
  const sessionsQ = useChatterSessions("active-only");
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  const profiles = profilesQ.data ?? [];
  const vaultCounts = vaultCountsQ.data ?? {};
  const totalVault = Object.values(vaultCounts).reduce((a, b) => a + b, 0);
  const totalImages = profiles.reduce((a, p) => a + (vaultCounts[p.id] ?? 0), 0);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Chatter Evaluator
            </h1>
            <p className="text-sm text-muted-foreground">
              Evalúa chatters con perfiles, vault y criterios compartidos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {sessionsQ.data && sessionsQ.data.length > 0 && (
              <Button asChild variant="outline" className="gap-2">
                <Link to="/chatter-evaluator/workspace">
                  <ListChecks className="h-4 w-4" />
                  Workspace ({sessionsQ.data.length})
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="gap-2">
              <Link to="/chatter-evaluator/admin">
                <Settings className="h-4 w-4" />
                Admin
              </Link>
            </Button>
            <Button onClick={() => setNewSessionOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva sesión
            </Button>
          </div>
        </div>

        <NewSessionDialog open={newSessionOpen} onOpenChange={setNewSessionOpen} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={ImageIcon}
            label="Perfiles"
            value={profilesQ.isLoading ? "…" : profiles.length}
          />
          <StatCard
            icon={Video}
            label="Items en vault"
            value={vaultCountsQ.isLoading ? "…" : totalVault}
          />
          <StatCard
            icon={ListChecks}
            label="Criterios activos"
            value={criteriaQ.isLoading ? "…" : (criteriaQ.data ?? []).length}
          />
          <StatCard
            icon={Mail}
            label="Emails de notificación"
            value={configQ.isLoading ? "…" : (configQ.data?.notification_emails.length ?? 0)}
          />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Perfiles</h2>
            <p className="text-sm text-muted-foreground">
              {profiles.length === 0
                ? ""
                : `${profiles.length} perfiles · ${totalImages} items totales`}
            </p>
          </div>

          {profilesQ.isLoading && (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          )}

          {profilesQ.error && (
            <Card>
              <CardContent className="p-4 text-sm text-destructive">
                Error cargando perfiles: {(profilesQ.error as Error).message}
              </CardContent>
            </Card>
          )}

          {!profilesQ.isLoading && profiles.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No hay perfiles aún. La migración inicial debería haberlos
                cargado — corre <code>scripts/migrate-chatters</code> si la
                lista está vacía después del setup inicial.
              </CardContent>
            </Card>
          )}

          {profiles.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  vaultCount={vaultCounts[p.id] ?? 0}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default ChatterEvaluatorContent;
