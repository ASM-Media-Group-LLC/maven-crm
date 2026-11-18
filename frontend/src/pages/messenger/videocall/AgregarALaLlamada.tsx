// «Agregar a la llamada» (Alvaro, 18/11/2026: llamadas tipo Skype). Busca a
// alguien de la agencia y le hace sonar la llamada en curso; el 1 a 1 pasa a
// ser de grupo. Antes solo existía «Copiar enlace».
import { useEffect, useMemo, useState } from "react";
import { Loader2, Phone, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { asegurarLlamada, invitarALaLlamada } from "@/lib/llamadaInvitar";
import type { Invitado } from "@/hooks/useInvitadosDeLaLlamada";
import { cn } from "@/lib/utils";

interface Persona { id: string; full_name: string | null }

interface Props {
  roomName: string;
  uid: string;
  tipo: "audio" | "video";
  invitados: Invitado[];
  alInvitar: () => void;
}

export default function AgregarALaLlamada({ roomName, uid, tipo, invitados, alInvitar }: Props) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Persona[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [llamando, setLlamando] = useState(false);

  const estadoDe = useMemo(() => new Map(invitados.map((i) => [i.user_id, i.status])), [invitados]);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const espera = setTimeout(async () => {
      setBuscando(true);
      const q = busqueda.trim();
      let consulta = supabase.from("profiles").select("id, full_name").is("deleted_at", null).neq("id", uid).order("full_name").limit(30);
      if (q) consulta = consulta.ilike("full_name", `%${q.replace(/[%_]/g, "")}%`);
      const { data, error } = await consulta;
      if (!vigente) return;
      setBuscando(false);
      // Un fallo no es «no hay nadie»: se dice y se puede reintentar escribiendo.
      setFallo(!!error);
      setResultados(error ? [] : ((data ?? []) as Persona[]));
    }, 250);
    return () => { vigente = false; clearTimeout(espera); };
  }, [abierto, busqueda, uid]);

  const alternar = (id: string) =>
    setElegidos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const llamar = async () => {
    if (!elegidos.size) return;
    setLlamando(true);
    try {
      const llamada = await asegurarLlamada(roomName, uid, tipo);
      const invitados = await invitarALaLlamada(llamada, uid, [...elegidos]);
      toast.success(t("messenger.enLlamada.agregar.sonando", { n: invitados.length }));
      setElegidos(new Set());
      setAbierto(false);
      alInvitar();
    } catch {
      toast.error(t("messenger.enLlamada.agregar.error"));
    } finally {
      setLlamando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/10 transition-colors"
        title={t("messenger.enLlamada.agregar.boton")}
      >
        <UserPlus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("messenger.enLlamada.agregar.boton")}</span>
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="vidrio max-w-md rounded-[20px] border-border/60 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{t("messenger.enLlamada.agregar.titulo")}</DialogTitle>
          </DialogHeader>
          <div className="px-5">
            <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t("messenger.enLlamada.agregar.buscar")}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
          <div className="max-h-80 overflow-y-auto px-2 py-2">
            {buscando && !resultados.length && (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            )}
            {fallo && <p className="px-3 py-6 text-center text-sm text-destructive">{t("messenger.enLlamada.agregar.errorBuscar")}</p>}
            {!buscando && !fallo && !resultados.length && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("messenger.enLlamada.agregar.nadie")}</p>
            )}
            {resultados.map((p) => {
              const estado = estadoDe.get(p.id);
              const adentro = estado === "accepted";
              const sonando = estado === "ringing";
              const elegido = elegidos.has(p.id);
              const nombre = p.full_name || "?";
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={adentro || sonando}
                  onClick={() => alternar(p.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                    elegido ? "bg-primary/15" : "hover:bg-primary/5",
                    (adentro || sonando) && "opacity-60 cursor-default",
                  )}
                >
                  {/* Avatar de una letra (sistema de diseño). */}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                    {nombre.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{nombre}</span>
                  {adentro && <span className="text-[11px] text-success">{t("messenger.enLlamada.agregar.adentro")}</span>}
                  {sonando && <span className="text-[11px] text-primary animate-pulse">{t("messenger.enLlamada.agregar.estaSonando")}</span>}
                  {!adentro && !sonando && (
                    <span className={cn("h-4 w-4 rounded-full border", elegido ? "border-primary bg-primary" : "border-border")} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            <button
              type="button"
              disabled={!elegidos.size || llamando}
              onClick={llamar}
              className="inline-flex items-center gap-2 rounded-full bg-success px-4 py-2 text-sm font-medium text-success-foreground disabled:opacity-50"
            >
              {llamando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              {t("messenger.enLlamada.agregar.llamar", { n: elegidos.size })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
