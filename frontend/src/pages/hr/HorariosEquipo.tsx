import { CalendarClock } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { ListaHorarios } from "@/components/horarios/ListaHorarios";

// HORARIOS DEL EQUIPO (Alvaro, 19/11/2026): donde RR. HH. y los supervisores
// (Daniel Ospina, Breyner, Vanessa) ponen y confirman el horario de su gente.
// Cada uno ve solo a quien puede cambiar (candado en el servidor). Desde el
// 19/11 también ve la pausa de cada persona (sale de su puesto).

export default function HorariosEquipo() {
  const { t } = useLanguage();
  return (
    <Page>
      <PageHeader icon={<CalendarClock className="h-5 w-5" />} title={t("hr.horEq.titulo")} subtitle={t("hr.horEq.sub")} />
      <section className="vidrio mt-4 overflow-hidden p-0">
        <ListaHorarios />
      </section>
    </Page>
  );
}
