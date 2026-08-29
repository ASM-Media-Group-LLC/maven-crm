import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";
import { Loader2, Heart, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KARMA_ORDER, KarmaStarKey, KarmaProfile,
  isKarmaLegend, useKarmaProfile, useSendKarma,
} from "../useKarmaProfile";

const STAR_PATH = "M12 2.4l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.3 6.2 20.3l1.1-6.45L2.6 9.25l6.5-.95z";
const STAR_LABEL: Record<KarmaStarKey, string> = {
  rendimiento: "Rendimiento", actividad: "Actividad", constancia: "Constancia",
  productividad: "Productividad", companerismo: "Compañerismo",
};
const GOLD = "#e59321";

function Star({ filled, special, tip }: { filled: boolean; special?: boolean; tip?: string }) {
  return (
    <div className={cn("kp-star", filled && "filled", special && "special")} tabIndex={tip ? 0 : -1}>
      <svg className="kp-glyph kp-star-empty" viewBox="0 0 24 24" aria-hidden>
        <path d={STAR_PATH} fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      {filled && (
        <svg className="kp-glyph kp-star-fill" viewBox="0 0 24 24" aria-hidden>
          <path d={STAR_PATH} fill="url(#kpGold)" />
        </svg>
      )}
      {tip && <span className="kp-tip" dangerouslySetInnerHTML={{ __html: tip }} />}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="bg-muted/40 border border-border rounded-2xl p-3">
      <div className="text-[10.5px] text-muted-foreground font-semibold">{label}</div>
      <div className="font-mono font-bold text-[22px] leading-tight mt-1 tabular-nums">{value.toLocaleString("es")}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>
    </div>
  );
}

function CardBody({ data, onSend, sending }: { data: KarmaProfile; onSend: () => void; sending: boolean }) {
  const legend = isKarmaLegend(data);
  const admin = data.viewer_is_admin;
  // Las estrellas se rellenan EN ORDEN (izquierda→derecha): las ganadas primero,
  // las pendientes después. Así 1 estrella siempre aparece en la 1ª posición.
  // La especial (karma votado) va aparte, en su posición fija al final.
  const earnedKeys = KARMA_ORDER.filter((k) => data.stars[k]);
  const pendingKeys = KARMA_ORDER.filter((k) => !data.stars[k]);
  const packed = [...earnedKeys, ...pendingKeys];
  const earned = earnedKeys.map((k) => STAR_LABEL[k]);

  return (
    <div className={cn("kp-card", legend && "kp-legend", !legend && admin && "kp-admin")}>
      {/* gradientes dorados para el relleno de las estrellas */}
      <svg className="kp-defs" aria-hidden>
        <defs>
          <linearGradient id="kpGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffdd82" />
            <stop offset="1" stopColor="#e59321" />
          </linearGradient>
        </defs>
      </svg>

      {legend && (
        <div className="kp-ribbon">🌟 Karma votado por el equipo · {data.vote_pct}%</div>
      )}
      <div className="kp-banner" />

      <div className="px-5 pb-5">
        <div className="-mt-11 flex justify-center">
          <UserAvatar name={data.name} src={data.avatar_url} seed={data.avatar_seed} size="xl" ring />
        </div>

        <h2 className="kp-name text-center text-2xl font-bold mt-3 leading-tight tracking-tight">
          {data.name || "Usuario"}
        </h2>
        <div className="flex justify-center mt-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground/80 bg-muted border border-border px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {data.role}
          </span>
        </div>

        {/* Karma Points */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-[0.13em] uppercase text-muted-foreground">Karma Points</span>
            <span className="text-[11px] font-bold font-mono" style={{ color: GOLD }}>{data.stars_count} / 5</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            {packed.map((k, i) => {
              const filled = i < earnedKeys.length;
              return (
                <Star
                  key={k}
                  filled={filled}
                  tip={admin ? `<b>${STAR_LABEL[k]}</b>${filled ? "Conseguida" : "Bloqueada"} · ${data.admin?.criteria?.[k]?.rule ?? ""}` : undefined}
                />
              );
            })}
            {data.special && (
              <>
                <div className="kp-sep" />
                <Star special filled tip={admin ? "<b>🌟 Karma Votado</b>Más del 70% del equipo le mandó karma" : undefined} />
              </>
            )}
          </div>
          <div className="text-center text-[11.5px] text-muted-foreground mt-3 min-h-[16px]">
            {admin
              ? (earned.length ? <b className="font-medium">{earned.join(" · ")}</b> : "Sin estrellas todavía")
              : (data.stars_count ? `${data.stars_count} de 5 estrellas de karma` : "Todavía sin estrellas de karma")}
          </div>
        </div>

        {/* Mandar karma */}
        {!data.is_self && (
          <div className="mt-5">
            <button
              type="button"
              onClick={onSend}
              disabled={data.viewer_has_sent || legend || sending}
              className={cn(
                "w-full flex items-center justify-center gap-2 font-bold text-sm py-3 rounded-2xl transition active:translate-y-px",
                legend ? "kp-btn-legend cursor-default"
                  : data.viewer_has_sent ? "kp-btn-sent cursor-default"
                    : "kp-btn-primary hover:brightness-110",
              )}
            >
              {legend ? <>👑 Ya es leyenda</>
                : data.viewer_has_sent ? <><Check className="h-4 w-4" /> Le mandaste karma</>
                  : sending ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Heart className="h-[17px] w-[17px] fill-current" /> Mandar Karma</>}
            </button>

            {/* medidor hacia el 70% — SOLO admin */}
            {admin && !legend && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5 font-semibold">
                  <span>Karma del equipo</span>
                  <span className="font-mono" style={{ color: GOLD }}>{data.vote_pct}%</span>
                </div>
                <div className="kp-track"><div className="kp-fill" style={{ width: `${Math.min(100, data.vote_pct)}%` }} /><div className="kp-goal" /></div>
                <div className="text-[10.5px] text-muted-foreground/70 mt-1.5 text-center">Al 70% se enciende la estrella dorada ✨</div>
              </div>
            )}
          </div>
        )}

        {/* Vista admin: enviados / recibidos / Hubstaff */}
        {admin && data.admin && (
          <div className="mt-5 pt-4 border-t border-dashed border-border">
            <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-[0.13em] uppercase mb-3" style={{ color: "#5b8cff" }}>
              🔒 Vista admin
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="✉️ Enviados" value={data.admin.msgs_sent_30d} sub="últimos 30 días" />
              <Stat label="📥 Recibidos" value={data.admin.msgs_recv_30d} sub="últimos 30 días" />
              <div className="col-span-2 bg-muted/40 border border-border rounded-2xl p-3">
                <div className="text-[10.5px] text-muted-foreground font-semibold">📊 Productividad · Hubstaff</div>
                {data.admin.hub_activity_30d != null ? (
                  <>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="kp-track flex-1"><div className="kp-fill" style={{ width: `${data.admin.hub_activity_30d}%`, background: "linear-gradient(90deg,#3ecf8e,#5b8cff)" }} /></div>
                      <span className="font-mono font-bold text-[15px]" style={{ color: "#3ecf8e" }}>{data.admin.hub_activity_30d}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-1">
                      actividad promedio{data.admin.hub_hours_30d != null ? ` · ${data.admin.hub_hours_30d} h este mes` : ""}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-muted-foreground/70 mt-1.5">Sin datos de Hubstaff (cuenta no enlazada)</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfileCard({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const open = !!userId;
  const { data, isLoading } = useKarmaProfile(userId);
  const sendKarma = useSendKarma();
  const invalid = !!data && (data as unknown as { error?: string }).error != null;

  const handleSend = () => {
    if (userId && data && !data.viewer_has_sent && !isKarmaLegend(data)) sendKarma.mutate(userId);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-none bg-transparent border-0 ring-0 shadow-none p-0 rounded-[26px] w-full max-w-[360px] overflow-visible">
        <DialogTitle className="sr-only">Ficha de {data?.name ?? "usuario"}</DialogTitle>
        {isLoading || !data ? (
          <div className="kp-card">
            <div className="kp-banner" />
            <div className="px-5 pb-8">
              <div className="-mt-11 flex justify-center"><div className="h-16 w-16 rounded-full bg-muted animate-pulse" /></div>
              <div className="h-6 w-40 bg-muted rounded mx-auto mt-4 animate-pulse" />
              <div className="h-5 w-24 bg-muted rounded-full mx-auto mt-3 animate-pulse" />
              <div className="flex justify-center gap-2 mt-6">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-8 w-8 rounded bg-muted animate-pulse" />)}
              </div>
            </div>
          </div>
        ) : invalid ? (
          <div className="kp-card"><div className="kp-banner" /><div className="px-5 py-10 text-center text-sm text-muted-foreground">No se pudo cargar la ficha.</div></div>
        ) : (
          <CardBody data={data} onSend={handleSend} sending={sendKarma.isPending} />
        )}
      </DialogContent>
    </Dialog>
  );
}
