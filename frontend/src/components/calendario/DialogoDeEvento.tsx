import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import Invitados from "@/components/calendario/Invitados";
import { aCampos, aInstante, claveDeDia } from "@/lib/calendario";
import {
  useBorrarEvento, useCrearEvento, useGuardarEvento,
  type EventoDelCalendario, type VisibilidadEvento,
} from "@/hooks/useCalendario";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Editar uno existente. */
  evento?: EventoDelCalendario | null;
  /** Crear uno nuevo en este día. */
  dia?: Date | null;
  /** Hora a la que se hizo clic en la grilla de la semana, 0-23. Sin esto el
   *  formulario abre siempre a las 9, que en la vista de semana sería raro:
   *  hacés clic en las 15:00 y te propone otra hora. */
  hora?: number | null;
  /** Solo el dueño edita. Un evento del equipo se ve, no se toca. */
  esMio: boolean;
}

export default function DialogoDeEvento({ abierto, onCerrar, evento, dia, hora, esMio }: Props) {
  const { t } = useLanguage();
  const crear = useCrearEvento();
  const guardar = useGuardarEvento();
  const borrar = useBorrarEvento();

  const [titulo, setTitulo] = useState("");
  const [todoElDia, setTodoElDia] = useState(false);
  const [desdeFecha, setDesdeFecha] = useState("");
  const [desdeHora, setDesdeHora] = useState("");
  const [hastaFecha, setHastaFecha] = useState("");
  const [hastaHora, setHastaHora] = useState("");
  const [lugar, setLugar] = useState("");
  const [enlace, setEnlace] = useState("");
  const [notas, setNotas] = useState("");
  const [visibilidad, setVisibilidad] = useState<VisibilidadEvento>("privado");

  // Al abrir se carga lo que corresponda. Va en un efecto y no en el estado
  // inicial porque el diálogo se monta una vez y se reusa para cada evento.
  useEffect(() => {
    if (!abierto) return;
    if (evento) {
      const i = aCampos(evento.starts_at, evento.all_day);
      const f = evento.ends_at ? aCampos(evento.ends_at, evento.all_day) : null;
      setTitulo(evento.title);
      setTodoElDia(evento.all_day);
      setDesdeFecha(i.fecha);
      setDesdeHora(i.hora);
      setHastaFecha(f?.fecha ?? "");
      setHastaHora(f?.hora ?? "");
      setLugar(evento.location ?? "");
      setEnlace(evento.url ?? "");
      setNotas(evento.description ?? "");
      setVisibilidad(evento.visibility);
      return;
    }
    const base = dia ?? new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    // Una reunión que arranca a las 23 termina a las 23:59 y no a las 24:00:
    // ese fin no existe y el evento se guardaría con fin antes del inicio.
    const arranca = hora ?? 9;
    setTitulo("");
    setTodoElDia(false);
    setDesdeFecha(claveDeDia(base));
    setDesdeHora(`${p(arranca)}:00`);
    setHastaFecha(claveDeDia(base));
    setHastaHora(arranca >= 23 ? "23:59" : `${p(arranca + 1)}:00`);
    setLugar("");
    setEnlace("");
    setNotas("");
    setVisibilidad("privado");
  }, [abierto, evento, dia, hora]);

  const trabajando = crear.isPending || guardar.isPending || borrar.isPending;

  const enviar = () => {
    if (!titulo.trim()) {
      toast.error(t("cal.faltaTitulo"));
      return;
    }
    const inicio = aInstante(desdeFecha, todoElDia ? null : desdeHora || "00:00");
    const fin = hastaFecha
      ? aInstante(hastaFecha, todoElDia ? null : hastaHora || desdeHora || "00:00")
      : null;
    // La base tiene el mismo CHECK; se avisa acá para no gastar un viaje y
    // para que el mensaje sea legible en vez del error de Postgres.
    if (fin && fin < inicio) {
      toast.error(t("cal.finAntes"));
      return;
    }

    const datos = {
      title: titulo.trim(),
      starts_at: inicio,
      ends_at: fin,
      all_day: todoElDia,
      location: lugar.trim() || null,
      url: enlace.trim() || null,
      description: notas.trim() || null,
      visibility: visibilidad,
    };

    const alFallar = (e: unknown) => toast.error((e as Error).message || "No se pudo guardar");

    if (evento) {
      guardar.mutate({ id: evento.id, ...datos }, {
        onSuccess: () => { toast.success(t("cal.guardado")); onCerrar(); },
        onError: alFallar,
      });
    } else {
      crear.mutate(datos, {
        onSuccess: () => { toast.success(t("cal.creado")); onCerrar(); },
        onError: alFallar,
      });
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      {/* Con invitados el formulario pasa el alto de una pantalla chica: el
          diálogo scrollea en vez de cortar los botones de abajo. */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{evento ? t("cal.editar") : t("cal.nuevo")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cal-titulo">{t("cal.titulo")}</Label>
            <Input
              id="cal-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={t("cal.tituloPlaceholder")}
              disabled={!esMio}
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between rounded-panel border border-border/60 px-3 py-2">
            <Label htmlFor="cal-todo-el-dia" className="cursor-pointer">
              {t("cal.todoElDia")}
            </Label>
            <Switch
              id="cal-todo-el-dia"
              checked={todoElDia}
              onCheckedChange={setTodoElDia}
              disabled={!esMio}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cal-desde">{t("cal.empieza")}</Label>
              <Input id="cal-desde" type="date" value={desdeFecha} disabled={!esMio}
                onChange={(e) => setDesdeFecha(e.target.value)} />
              {!todoElDia && (
                <Input type="time" value={desdeHora} disabled={!esMio}
                  onChange={(e) => setDesdeHora(e.target.value)} />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cal-hasta">{t("cal.termina")}</Label>
              <Input id="cal-hasta" type="date" value={hastaFecha} disabled={!esMio}
                onChange={(e) => setHastaFecha(e.target.value)} />
              {!todoElDia && (
                <Input type="time" value={hastaHora} disabled={!esMio}
                  onChange={(e) => setHastaHora(e.target.value)} />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cal-lugar">{t("cal.lugar")}</Label>
            <Input id="cal-lugar" value={lugar} disabled={!esMio}
              onChange={(e) => setLugar(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cal-enlace">{t("cal.enlace")}</Label>
            <Input id="cal-enlace" value={enlace} disabled={!esMio} inputMode="url"
              onChange={(e) => setEnlace(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cal-notas">{t("cal.notas")}</Label>
            <Textarea id="cal-notas" value={notas} rows={3} disabled={!esMio}
              onChange={(e) => setNotas(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-panel border border-border/60 px-3 py-2">
            <Label className="cursor-default">{t("cal.quienLoVe")}</Label>
            <div className="flex gap-1 rounded-full bg-muted/60 p-1">
              {(["privado", "equipo"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={!esMio}
                  onClick={() => setVisibilidad(v)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    visibilidad === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(v === "privado" ? "cal.privado" : "cal.equipo")}
                </button>
              ))}
            </div>
          </div>

          {/* Invitar es ortogonal a la visibilidad: un evento puede seguir
              siendo privado y aun así tener invitados, que lo ven porque
              están invitados. No se vuelve del equipo por invitar a tres. */}
          <Invitados eventoId={evento?.id} soyDueno={esMio && !!evento} />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {evento && esMio ? (
            <Button
              variant="ghost"
              className="rounded-full text-destructive hover:text-destructive"
              disabled={trabajando}
              onClick={() =>
                borrar.mutate(evento.id, {
                  onSuccess: () => { toast.success(t("cal.borrado")); onCerrar(); },
                  onError: (e) => toast.error((e as Error).message),
                })
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("common.delete")}
            </Button>
          ) : <span />}

          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={onCerrar}>
              {t("common.cancel")}
            </Button>
            {esMio && (
              <Button className="rounded-full" onClick={enviar} disabled={trabajando}>
                {trabajando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("cal.guardar")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
