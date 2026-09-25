import { useEffect, useState } from "react";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import {
  useChatterProfiles,
  useChatterEvaluators,
  useCreateChatterSession,
} from "@/hooks/useChatterEvaluator";
import { useAuth } from "@/hooks/useAuth";
import type { ChatterProfile, ChatterSession } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ProfilePicker = ({
  profiles,
  selected,
  onSelect,
}: {
  profiles: ChatterProfile[];
  selected: string | null;
  onSelect: (id: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {profiles.map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => onSelect(p.id)}
        className={`relative aspect-square overflow-hidden rounded-md border-2 transition-colors ${
          selected === p.id
            ? "border-primary ring-2 ring-primary/30"
            : "border-border hover:border-primary/40"
        }`}
      >
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt={p.name}
            className="h-full w-full object-cover"
            style={{
              objectPosition: `${p.avatar_x ?? 50}% ${p.avatar_y ?? 50}%`,
              transform: `scale(${(p.avatar_zoom ?? 100) / 100})`,
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground">
            {p.name[0]}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-xs text-white">
          {p.name}
        </div>
      </button>
    ))}
  </div>
);

const SuccessView = ({
  session,
  examinerName,
  onClose,
}: {
  session: ChatterSession;
  examinerName: string;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const publicUrl = `${getPublicBaseUrl()}/chatter/${session.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(t("chatters.newSess.linkCopied"));
    } catch (e) {
      toast.error(t("common.couldNotCopy"), { description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm">
          {t("chatters.newSess.createdFor")} <strong>{session.chatter_name}</strong>.
        </p>
        <p className="mt-0.5 text-sm">
          {t("chatters.newSess.examiner")} <strong>{examinerName}</strong>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("chatters.newSess.shareLink", { min: session.duration_minutes })}
        </p>
      </div>
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
            {publicUrl}
          </code>
          <Button onClick={handleCopy} size="icon" variant="outline" aria-label={t("common.copy")}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("common.close")}
        </Button>
        <Button
          onClick={() => {
            onClose();
            navigate("/chatter-evaluator/workspace");
          }}
        >
          {t("chatters.newSess.goToWorkspace")}
        </Button>
      </DialogFooter>
    </div>
  );
};

export const NewSessionDialog = ({ open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const profilesQ = useChatterProfiles();
  const evaluatorsQ = useChatterEvaluators();
  const createMut = useCreateChatterSession();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [chatterName, setChatterName] = useState("");
  const [duration, setDuration] = useState(60);
  const [examinerUserId, setExaminerUserId] = useState<string>("");
  const [created, setCreated] = useState<ChatterSession | null>(null);

  // Default a "yo mismo" cuando el user está disponible (mismo
  // comportamiento que antes: si no tocas el select, la sesión queda
  // asignada al creador).
  useEffect(() => {
    if (open && user?.id && !examinerUserId) {
      setExaminerUserId(user.id);
    }
  }, [open, user?.id, examinerUserId]);

  const reset = () => {
    setProfileId(null);
    setChatterName("");
    setDuration(60);
    setExaminerUserId(user?.id ?? "");
    setCreated(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleCreate = async () => {
    if (!profileId || !chatterName.trim()) {
      toast.error(t("chatters.newSess.missingProfileOrName"));
      return;
    }
    if (!examinerUserId) {
      toast.error(t("chatters.newSess.missingExaminer"));
      return;
    }
    try {
      const session = await createMut.mutateAsync({
        profileId,
        chatterName: chatterName.trim(),
        durationMinutes: duration,
        examinerUserId,
      });
      setCreated(session);
      const assignedToSelf = examinerUserId === user?.id;
      toast.success(
        assignedToSelf
          ? t("chatters.newSess.created")
          : t("chatters.newSess.createdAndAssigned"),
      );
    } catch (e) {
      toast.error(t("chatters.newSess.couldNotCreate"), {
        description: (e as Error).message,
      });
    }
  };

  // Lista para el select de "Asignar a". Siempre asegurar que el current
  // user aparezca como primera opción aunque la query aún esté cargando o
  // su rol falte momentáneamente en la lista.
  const evaluators = evaluatorsQ.data ?? [];
  const orderedEvaluators = (() => {
    if (!user?.id) return evaluators;
    const self = evaluators.find((e) => e.user_id === user.id);
    const rest = evaluators.filter((e) => e.user_id !== user.id);
    if (self) return [self, ...rest];
    // Si por algún motivo el user actual no apareció en la query (rol
    // legacy / cache stale), igual lo agregamos como primera opción para
    // no romper el flujo de "asignar a mí mismo".
    return [
      {
        user_id: user.id,
        full_name: user.user_metadata?.full_name || user.email || t("chatters.newSess.me"),
        avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      },
      ...rest,
    ];
  })();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{created ? t("chatters.newSess.ready") : t("chatters.newSess.title")}</DialogTitle>
          {!created && (
            <DialogDescription>
              {t("chatters.newSess.desc")}
            </DialogDescription>
          )}
        </DialogHeader>

        {created ? (
          <SuccessView
            session={created}
            examinerName={
              orderedEvaluators.find((e) => e.user_id === created.examiner_user_id)?.full_name
                ?? (created.examiner_user_id === user?.id ? t("chatters.newSess.me") : t("chatters.newSess.noName"))
            }
            onClose={() => handleClose(false)}
          />
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">{t("chatters.newSess.profile")}</Label>
              {profilesQ.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("chatters.newSess.loadingProfiles")}</p>
              ) : (
                <ProfilePicker
                  profiles={profilesQ.data ?? []}
                  selected={profileId}
                  onSelect={setProfileId}
                />
              )}
            </div>

            <div>
              <Label htmlFor="examiner">{t("chatters.newSess.assignTo")}</Label>
              <Select value={examinerUserId} onValueChange={setExaminerUserId}>
                <SelectTrigger id="examiner">
                  <SelectValue placeholder={evaluatorsQ.isLoading ? t("common.loading") : t("chatters.newSess.pickExaminer")} />
                </SelectTrigger>
                <SelectContent>
                  {orderedEvaluators.map((ev) => {
                    const isSelf = ev.user_id === user?.id;
                    return (
                      <SelectItem key={ev.user_id} value={ev.user_id}>
                        <div className="flex items-center gap-2">
                          <UserAvatar name={ev.full_name} src={ev.avatar_url} size="xs" />
                          <span>
                            {isSelf ? `${t("chatters.newSess.me")} · ` : ""}
                            {ev.full_name}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("chatters.newSess.assignHelp")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
              <div>
                <Label htmlFor="chatter-name">{t("chatters.newSess.chatterName")}</Label>
                <Input
                  id="chatter-name"
                  value={chatterName}
                  onChange={(e) => setChatterName(e.target.value)}
                  placeholder={t("chatters.newSess.chatterNamePlaceholder")}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="duration">{t("chatters.newSess.duration")}</Label>
                <Input
                  id="duration"
                  type="number"
                  min={5}
                  max={240}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10) || 60)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMut.isPending || !profileId || !chatterName.trim()}
                className="gap-2"
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("chatters.newSess.create")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewSessionDialog;
