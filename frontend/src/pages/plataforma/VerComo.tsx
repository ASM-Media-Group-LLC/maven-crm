import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Headphones, Search, ShieldCheck, UserCog } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/useLanguage";
import type { RolDePersona } from "@/lib/plataforma";
import { cn } from "@/lib/utils";
import { usePlataforma, type VerComo } from "./contexto";
import { Cargando, ErrorConReintento, Inicial } from "./piezas";

// «VER COMO» (VerComo.tsx de Lumina): el dueño y Grace ven la plataforma con los
// ojos de otro. Tres alcances: por ROL, por CLIENTE y por PERSONA. Al entrar, el
// cartel ámbar «Volver a ser yo» deja claro que no eres tú, y todo es SOLO LECTURA
// (lib/plataforma soloLectura: lo que escribe tira «solo_lectura»).

type Pestana = "rol" | "cliente" | "persona";

export function VerComoDialogo({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const p = usePlataforma();
  const navigate = useNavigate();
  const [pestana, setPestana] = useState<Pestana>("rol");
  const [q, setQ] = useState("");

  const clientesQ = useQuery({ queryKey: ["plataforma", "dueno"], queryFn: () => p.datos.organizacionesDelDueno() });
  const personasQ = useQuery({ queryKey: ["plataforma", "todas-las-personas"], queryFn: () => p.datos.todasLasPersonas(), enabled: pestana === "persona" });

  const clientes = (clientesQ.data?.clientes ?? []).filter((c) => c.organizacion.estado !== "archivada");
  // «Por rol» se mira en el primer cliente activo que no sea demo.
  const ejemplo = clientes.find((c) => c.organizacion.estado === "activa" && !c.organizacion.es_demo) ?? clientes[0];

  const entrar = (v: VerComo) => {
    p.entrarVerComo(v);
    onClose();
    navigate(`/mi-empresa?org=${v.organizacion_id}`);
  };

  const roles: { rol: VerComo["rol"]; icono: typeof ShieldCheck; nombre: string; desc: string }[] = [
    { rol: "admin_cliente", icono: ShieldCheck, nombre: t("plataforma.rol.adminCliente"), desc: t("plataforma.verComo.rolAdminDesc") },
    { rol: "supervisor", icono: UserCog, nombre: t("plataforma.rol.supervisor"), desc: t("plataforma.verComo.rolSupervisorDesc") },
    { rol: "empleado", icono: Headphones, nombre: t("plataforma.rol.empleado"), desc: t("plataforma.verComo.rolEmpleadoDesc") },
  ];

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (personasQ.data ?? [])
      .filter((x) => !s || x.nombre.toLowerCase().includes(s) || x.correo.toLowerCase().includes(s) || x.organizacion_nombre.toLowerCase().includes(s))
      .slice(0, 40);
  }, [personasQ.data, q]);

  const rolDePersona = (r: RolDePersona): VerComo["rol"] => (r === "admin" ? "admin_cliente" : r);
  const fila = "flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/50";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{t("plataforma.verComo.soloLectura")}</div>
          <DialogTitle>{t("plataforma.verComo.titulo")}</DialogTitle>
          <DialogDescription>{t("plataforma.verComo.sub")}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg border border-border/70 p-1" role="tablist">
          {(["rol", "cliente", "persona"] as Pestana[]).map((k) => (
            <button key={k} role="tab" aria-selected={pestana === k} type="button" onClick={() => setPestana(k)}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium", pestana === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t(`plataforma.verComo.tab.${k}`)}
            </button>
          ))}
        </div>

        {clientesQ.isLoading ? <Cargando /> : clientesQ.error ? (
          <ErrorConReintento error={clientesQ.error} onReintentar={() => clientesQ.refetch()} />
        ) : pestana === "rol" ? (
          <div className="flex flex-col gap-2">
            {ejemplo && <p className="text-xs text-muted-foreground">{t("plataforma.verComo.enCliente", { cliente: ejemplo.organizacion.nombre })}</p>}
            {roles.map((r) => (
              <button key={r.rol} type="button" className={fila} disabled={!ejemplo}
                onClick={() => ejemplo && entrar({ alcance: "rol", rol: r.rol, organizacion_id: ejemplo.id, quien: `${r.nombre} · ${ejemplo.organizacion.nombre}` })}>
                <r.icono className="h-5 w-5 text-primary" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{r.nombre}</span><span className="block text-xs text-muted-foreground">{r.desc}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : pestana === "cliente" ? (
          <div className="flex flex-col gap-2">
            {clientes.map((c) => (
              <button key={c.id} type="button" className={fila}
                onClick={() => entrar({ alcance: "cliente", rol: "admin_cliente", organizacion_id: c.id, quien: t("plataforma.verComo.adminDe", { cliente: c.organizacion.nombre }) })}>
                <Building2 className="h-5 w-5 text-primary" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.organizacion.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.admin_principal?.correo ?? "—"}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("plataforma.verComo.buscar")} className="pl-9" autoFocus />
            </div>
            {personasQ.isLoading ? <Cargando /> : personasQ.error ? (
              <ErrorConReintento error={personasQ.error} onReintentar={() => personasQ.refetch()} />
            ) : lista.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("plataforma.verComo.nadie")}</p>
            ) : lista.map((x) => (
              <button key={`${x.organizacion_id}-${x.user_id}`} type="button" className={fila}
                onClick={() => entrar({ alcance: "persona", rol: rolDePersona(x.rol), organizacion_id: x.organizacion_id, quien: `${x.nombre} · ${x.organizacion_nombre}` })}>
                <Inicial nombre={x.nombre} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t(`plataforma.rol.${x.rol}`)} · {x.organizacion_nombre}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
