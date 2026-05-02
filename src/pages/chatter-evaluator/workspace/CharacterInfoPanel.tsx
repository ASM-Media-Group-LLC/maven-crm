import type { ChatterProfile } from "../types";
import { pVal, type ChatterLang } from "./ChatToolbar";

// Right-rail character info — drawer-style cards mirroring the categories
// admins fill in the profile editor (identity, body & limits, services,
// prices, extras). Both the chatter public view and the examiner workspace
// render this so they're looking at the same persona snapshot.

const InfoRow = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null | undefined;
  accent?: string;
}) => {
  if (!value) return null;
  return (
    <div>
      <div
        className="mb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
        style={{ color: accent ?? "hsl(var(--muted-foreground))" }}
      >
        {label}
      </div>
      <div className="text-sm leading-snug text-foreground">{value}</div>
    </div>
  );
};

const TONE = {
  violet:  { border: "border-l-violet-400 bg-violet-500/5",   badge: "bg-violet-500/15 text-violet-400",   accent: "rgb(167 139 250)" },
  rose:    { border: "border-l-rose-400 bg-rose-500/5",       badge: "bg-rose-500/15 text-rose-400",       accent: "rgb(251 113 133)" },
  emerald: { border: "border-l-emerald-400 bg-emerald-500/5", badge: "bg-emerald-500/15 text-emerald-400", accent: "rgb(52 211 153)" },
  gold:    { border: "border-l-amber-400 bg-amber-500/5",     badge: "bg-amber-500/15 text-amber-500",     accent: "rgb(251 191 36)" },
  red:     { border: "border-l-red-500 bg-red-500/10",        badge: "bg-red-500/20 text-red-400",         accent: "rgb(248 113 113)" },
} as const;
type Tone = keyof typeof TONE;

const InfoCard = ({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: string;
  tone: Tone;
  children: React.ReactNode;
}) => {
  const styles = TONE[tone];
  return (
    <div className={`rounded-lg border border-border border-l-4 ${styles.border} px-3 py-3`}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md text-sm ${styles.badge}`}>
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/80">
          {title}
        </span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
};

const hasAny = (...vals: (string | null | undefined)[]) =>
  vals.some((v) => typeof v === "string" && v.length > 0);

interface CharacterInfoPanelProps {
  profile: ChatterProfile;
  lang: ChatterLang;
  /** Compact = single-column hero, smaller paddings — used inside narrow
   *  side rails on the examiner workspace. */
  compact?: boolean;
}

export const CharacterInfoPanel = ({ profile, lang, compact = false }: CharacterInfoPanelProps) => {
  const en = lang === "en";
  const p = profile as unknown as Record<string, unknown>;
  const name = pVal(p, "name", lang) || profile.name;
  const nationality = pVal(p, "nationality", lang);
  const location = pVal(p, "location", lang);
  const age = pVal(p, "age", lang);
  const hasMeta = Boolean(nationality || location || age);

  const usersTerm = pVal(p, "users_term", lang);
  const greeting = pVal(p, "greeting", lang);
  const body = pVal(p, "body", lang);
  const nudity = pVal(p, "nudity", lang);
  const anal = pVal(p, "anal", lang);
  const collabs = pVal(p, "collabs", lang);
  const videocall = pVal(p, "videocall", lang);
  const custom = pVal(p, "custom", lang);
  const extra = pVal(p, "extra", lang);
  const prices = profile.prices && Object.keys(profile.prices).length > 0 ? profile.prices : null;

  const heroPad = compact ? "p-4" : "p-6";
  const avatarSize = compact ? "h-[72px] w-[72px]" : "h-[96px] w-[96px]";
  const nameClass = compact ? "text-base font-extrabold" : "text-xl font-extrabold tracking-tight";
  const stackPad = compact ? "p-2.5" : "p-3";

  return (
    <>
      <div className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-rose-500/10 to-amber-500/20" />
        <div className={`relative flex flex-col items-center text-center ${heroPad}`}>
          <div className={`mb-3 aspect-square ${avatarSize} overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-amber-500 ring-4 ring-card shadow-lg`}>
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={name}
                className="h-full w-full object-cover"
                style={{
                  objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                  transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
                {name[0]}
              </div>
            )}
          </div>
          <div className={nameClass}>{name}</div>
          {hasMeta && (
            <div className="mt-3 grid w-full grid-flow-col auto-cols-fr divide-x divide-border/40 text-center">
              {nationality && (
                <div className="px-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    {en ? "Nationality" : "Nacionalidad"}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-foreground/90">
                    {nationality}
                  </div>
                </div>
              )}
              {location && (
                <div className="px-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    {en ? "City" : "Ciudad"}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-foreground/90">
                    📍 {location}
                  </div>
                </div>
              )}
              {age && (
                <div className="px-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    {en ? "Age" : "Edad"}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-foreground/90">
                    {age}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`space-y-2.5 ${stackPad}`}>
        {hasAny(usersTerm, greeting) && (
          <InfoCard title={en ? "Identity" : "Identidad"} icon="🪪" tone="violet">
            <InfoRow label={en ? "How to call the user" : "Cómo llamar al usuario"} value={usersTerm} accent="rgb(167 139 250)" />
            <InfoRow label={en ? "Greeting" : "Saludo inicial"} value={greeting} accent="rgb(167 139 250)" />
          </InfoCard>
        )}

        {hasAny(body, nudity, anal, collabs) && (
          <InfoCard title={en ? "Body & limits" : "Cuerpo y límites"} icon="🌶️" tone="rose">
            <InfoRow label={en ? "Body / terms" : "Cuerpo / términos"} value={body} accent="rgb(251 113 133)" />
            <InfoRow label={en ? "Nudity" : "Desnudos"} value={nudity} accent="rgb(251 113 133)" />
            <InfoRow label="Anal" value={anal} accent="rgb(251 113 133)" />
            <InfoRow label={en ? "Collabs" : "Colaboraciones"} value={collabs} accent="rgb(251 113 133)" />
          </InfoCard>
        )}

        {hasAny(videocall, custom) && (
          <InfoCard title={en ? "Services" : "Servicios"} icon="🎥" tone="emerald">
            <InfoRow label={en ? "Videocalls" : "Videollamadas"} value={videocall} accent="rgb(52 211 153)" />
            <InfoRow label={en ? "Custom" : "Personalizados"} value={custom} accent="rgb(52 211 153)" />
          </InfoCard>
        )}

        {prices && (
          <InfoCard title={en ? "Prices" : "Precios"} icon="💰" tone="gold">
            {Object.entries(prices).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500/90">
                  {k}
                </span>
                <span className="text-sm font-semibold text-amber-400">{v}</span>
              </div>
            ))}
          </InfoCard>
        )}

        {extra && (
          <InfoCard title={en ? "Important" : "Importante"} icon="⚠️" tone="red">
            <p className="text-sm font-semibold leading-snug text-rose-300">{extra}</p>
          </InfoCard>
        )}
      </div>
    </>
  );
};

export default CharacterInfoPanel;
