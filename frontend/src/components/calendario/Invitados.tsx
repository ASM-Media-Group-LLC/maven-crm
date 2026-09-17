import { useMemo, useState } from "react";
import { Check, HelpCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { candidatosDelDirectorio, useDirectorioCorreo } from "@/hooks/useDirectorioCorreo";
import {
  useDesinvitar, useInvitados, useInvitar, useResponder,
  type RespuestaDeInvitado,
} from "@/hooks/useInvitados";

const RESPUESTAS: Record<RespuestaDeInvitado, { clave: TranslationKey; clase: string }> = {
  pendiente: { clave: "cal.resp.pendiente", clase: "text-muted-foreground" },
  va: { clave: "cal.resp.va", clase: "text-success" },
  no_va: { clave: "cal.resp.noVa", clase: "text-destructive" },
  quizas: { clave: "cal.resp.quizas", clase: "text-warning" },
};

/** Las tres respuestas posibles, con su icono. 'pendiente' no está: es el
 *  estado de partida, no algo que se elija. */
const BOTONES: { valor: RespuestaDeInvitado; icono: typeof Check; clave: TranslationKey }[] = [
  { valor: "va", icono: Check, clave: "cal.resp.va" },
  { valor: "quizas", icono: HelpCircle, clave: "cal.resp.quizas" },
  { valor: "no_va", icono: X, clave: "cal.resp.noVa" },
];

interface Props {
  eventoId: string | undefined;
  /** Quien organiza invita y desinvita; el resto solo mira y contesta. */
  soyDueno: boolean;
}

export default function Invitados({ eventoId, soyDueno }: Props) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [busqueda, setBusqueda] = useState("");

  const invitados = useInvitados(eventoId);
  const directorio = useDirectorioCorreo(!!eventoId);
  const invitar = useInvitar();
  const desinvitar = useDesinvitar();
  const responder = useResponder();

  const lista = invitados.data ?? [];
  const yaInvitados = useMemo(() => new Set(lista.map((i) => i.user_id)), [lista]);
  const gente = directorio.data ?? [];
  const porId = useMemo(() => new Map(gente.map((p) => [p.user_id, p])), [gente]);

  // Los candidatos salen del mismo buscador que usa el `@` del correo: por
  // cualquier palabra del nombre y también por la dirección, sin tildes.
  const candidatos = useMemo(() => {
    if (!busqueda.trim() || !soyDueno) return [];
    return candidatosDelDirectorio(gente, busqueda, undefined, 6)
      .filter((p) => !yaInvitados.has(p.user_id));
  }, [gente, busqueda, yaInvitados, soyDueno]);

  const miInvitacion = lista.find((i) => i.user_id === user?.id);

  // Un evento que todavía no existe no puede tener invitados: no hay a qué
  // colgarlos. Se dice, en vez de mostrar un buscador que no va a guardar nada.
  if (!eventoId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{t("cal.invitados")}</Label>
        <p className="text-xs text-muted-foreground">{t("cal.invitaAlGuardar")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("cal.invitados")}</Label>

      {/* Si me invitaron a mí, lo primero es poder contestar. */}
      {miInvitacion && (
        <div className="flex items-center gap-2 rounded-panel border border-border/60 px-3 py-2">
          <span className="text-sm text-muted-foreground">{t("cal.vas")}</span>
          <div className="ml-auto flex gap-1">
            {BOTONES.map(({ valor, icono: Icono, clave }) => (
              <button
                key={valor}
                type="button"
                disabled={responder.isPending}
                onClick={() =>
                  responder.mutate(
                    { eventoId, respuesta: valor },
                    {
                      onSuccess: () => toast.success(t("cal.respondiste")),
                      onError: (e) => toast.error((e as Error).message),
                    },
                  )
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  miInvitacion.respuesta === valor
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icono className="h-3.5 w-3.5" />
                {t(clave)}
              </button>
            ))}
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("cal.sinInvitados")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lista.map((inv) => {
            const p = porId.get(inv.user_id);
            const r = RESPUESTAS[inv.respuesta];
            return (
              <li key={inv.user_id} className="flex items-center gap-2 text-sm">
                <UserAvatar name={p?.nombre} src={p?.avatar_url} seed={p?.avatar_seed} size="xs" />
                <span className="min-w-0 flex-1 truncate">
                  {p?.nombre ?? p?.email_address ?? inv.user_id}
                </span>
                <span className={cn("shrink-0 text-xs", r.clase)}>{t(r.clave)}</span>
                {soyDueno && (
                  <button
                    type="button"
                    aria-label={t("cal.quitar")}
                    className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      desinvitar.mutate(
                        { eventoId, userId: inv.user_id },
                        { onError: (e) => toast.error((e as Error).message) },
                      )
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {soyDueno && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t("cal.buscarPersona")}
            className="rounded-full pl-9"
          />
          {candidatos.length > 0 && (
            <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-panel border border-border bg-popover p-1 shadow-md">
              {candidatos.map((p) => (
                <li key={p.user_id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      invitar.mutate(
                        { eventoId, userIds: [p.user_id] },
                        { onError: (e) => toast.error((e as Error).message) },
                      );
                      setBusqueda("");
                    }}
                  >
                    <UserAvatar name={p.nombre} src={p.avatar_url} seed={p.avatar_seed} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      {p.email_address}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
