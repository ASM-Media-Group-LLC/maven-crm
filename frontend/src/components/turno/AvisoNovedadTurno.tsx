import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMiTurno } from "@/hooks/useMiTurno";
import { AvisoNovedad } from "@/components/turno/PiezasTurno";

// EL AVISO PARA TODOS (Alvaro, 19/11/2026: «mañana 20/11, con aviso hoy»): una
// vez por equipo, a quien marca turno, explica cómo marcar entrada, pausa y
// salida. Lo de «ya lo vi» vive en el navegador (si se borra, sale otra vez).

const CLAVE = "maven-aviso-turno-v1";

function yaLoVio(): boolean {
  try { return localStorage.getItem(CLAVE) === "1"; } catch { return false; }
}

export function AvisoNovedadTurno() {
  const { t } = useLanguage();
  const q = useMiTurno();
  const [cerrado, setCerrado] = useState(yaLoVio);
  const tr = q.data;
  if (!tr?.aplica || cerrado) return null;
  const cerrar = () => {
    try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento: saldrá otra vez */ }
    setCerrado(true);
  };
  const fecha = tr.obligatorio_desde
    ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "numeric" }).format(new Date(tr.obligatorio_desde))
    : "";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent className="max-w-lg overflow-hidden border-border/60 p-0">
        <DialogTitle className="sr-only">{t("cowork.turno.novedad.titulo")}</DialogTitle>
        <AvisoNovedad fecha={fecha} onEntendido={cerrar} t={t} />
      </DialogContent>
    </Dialog>
  );
}
