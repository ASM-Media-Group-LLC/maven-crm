import { useMemo, useState } from "react";
import { ChevronsUpDown, Loader2, RotateCcw, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/hooks/useLanguage";
import {
  useCambiarExaminador,
  useChatterEvaluators,
  useExaminadoresAMano,
  useMavenUsers,
} from "@/hooks/useChatterEvaluator";

// ---------- Examinadores ----------
// Quién aparece en «Asignar a» al crear una sesión (Grace, 05/11/2026: «no deja
// agregar ni quitar personal ahí»). La lista sale del rol (permiso Chatters →
// Evaluator) y de los admins; aquí se agrega a alguien suelto o se saca a quien
// no evalúa. Sacado = no recibe sesiones (y si no es admin, deja de entrar al
// evaluador). «Volver a su rol» borra lo hecho a mano.
const ExaminadoresSection = () => {
  const { t } = useLanguage();
  const evaluadoresQ = useChatterEvaluators();
  const aManoQ = useExaminadoresAMano();
  const usuariosQ = useMavenUsers();
  const cambiar = useCambiarExaminador();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");

  const aMano = useMemo(() => new Map((aManoQ.data ?? []).map((x) => [x.user_id, x.permitido])), [aManoQ.data]);
  const evaluadores = evaluadoresQ.data ?? [];
  const enLista = useMemo(() => new Set(evaluadores.map((e) => e.user_id)), [evaluadores]);
  const nombreDe = useMemo(
    () => new Map((usuariosQ.data ?? []).map((u) => [u.id, u.full_name || t("chatters.newSess.noName")])),
    [usuariosQ.data, t],
  );
  const sacados = (aManoQ.data ?? []).filter((x) => !x.permitido && nombreDe.has(x.user_id));
  const candidatos = (usuariosQ.data ?? []).filter((u) => {
    if (enLista.has(u.id)) return false;
    const q = filtro.trim().toLowerCase();
    return !q || (u.full_name ?? "").toLowerCase().includes(q) || (u.role ?? "").toLowerCase().includes(q);
  });

  const hacer = (userId: string, permitido: boolean | null, aviso: string) =>
    cambiar.mutate({ userId, permitido }, {
      onSuccess: () => toast.success(aviso),
      onError: (e) => toast.error((e as Error).message),
    });

  const error = evaluadoresQ.error ?? aManoQ.error;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("chatters.admin.examinadores")}</h2>
            <p className="text-xs text-muted-foreground">{t("chatters.admin.examinadoresDesc")}</p>
          </div>
          <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
              <Button className="gap-2" disabled={cambiar.isPending}>
                <UserPlus className="h-4 w-4" /> {t("chatters.admin.agregarExaminador")}
                <ChevronsUpDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="border-b p-2">
                <Input
                  autoFocus
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder={t("chatters.admin.buscarPersona")}
                  className="h-8"
                />
              </div>
              <div className="max-h-72 overflow-y-auto p-1">
                {usuariosQ.isLoading && <div className="p-3 text-xs text-muted-foreground">{t("common.loading")}</div>}
                {usuariosQ.error && <div className="p-3 text-xs text-destructive">{(usuariosQ.error as Error).message}</div>}
                {!usuariosQ.isLoading && !usuariosQ.error && candidatos.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">{t("chatters.admin.sinCandidatos")}</div>
                )}
                {candidatos.map((u) => {
                  const nombre = u.full_name || t("chatters.newSess.noName");
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setAbierto(false);
                        setFiltro("");
                        hacer(u.id, true, t("chatters.admin.examinadorAgregado", { name: nombre }));
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <div className="aspect-square h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
                        {u.avatar_url && <img src={u.avatar_url} alt={nombre} className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{nombre}</div>
                        {u.role && <div className="text-xs capitalize text-muted-foreground">{u.role}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {error ? (
          <div className="flex items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {(error as Error).message}
            <Button size="sm" variant="secondary" onClick={() => { void evaluadoresQ.refetch(); void aManoQ.refetch(); }}>
              {t("chatters.admin.reintentar")}
            </Button>
          </div>
        ) : evaluadoresQ.isLoading ? (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {evaluadores.map((e) => {
              const nombre = e.full_name || t("chatters.newSess.noName");
              return (
                <li key={e.user_id} className="flex items-center gap-3 px-3 py-2">
                  <div className="aspect-square h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
                    {e.avatar_url && <img src={e.avatar_url} alt={nombre} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {aMano.get(e.user_id) === true ? t("chatters.admin.agregadoAMano") : t("chatters.admin.porSuRol")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    disabled={cambiar.isPending}
                    onClick={() => hacer(e.user_id, false, t("chatters.admin.examinadorSacado", { name: nombre }))}
                  >
                    {cambiar.isPending && cambiar.variables?.userId === e.user_id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <UserMinus className="h-4 w-4" />}
                    {t("chatters.admin.sacarExaminador")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {sacados.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t("chatters.admin.sacados")}</h3>
            <ul className="divide-y rounded-md border border-dashed">
              {sacados.map((x) => {
                const nombre = nombreDe.get(x.user_id) ?? t("chatters.newSess.noName");
                return (
                  <li key={x.user_id} className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">{nombre}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={cambiar.isPending}
                      onClick={() => hacer(x.user_id, null, t("chatters.admin.examinadorDevuelto", { name: nombre }))}
                    >
                      <RotateCcw className="h-4 w-4" /> {t("chatters.admin.volverASuRol")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExaminadoresSection;
