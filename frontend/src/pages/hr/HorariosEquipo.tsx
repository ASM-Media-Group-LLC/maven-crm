import { CalendarClock } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { ListaHorarios } from "@/components/horarios/ListaHorarios";
import { ModalidadesPausa } from "@/components/horarios/ModalidadesPausa";

// HORARIOS DEL EQUIPO (Alvaro, 19/11/2026): donde RR. HH. y los supervisores
// (Daniel Ospina, Breyner, Vanessa) ponen y confirman el horario de su gente.
// Cada uno ve solo a quien puede cambiar (candado en el servidor). Desde el
// 19/11 también la pausa de cada persona y las modalidades de la empresa.

export default function HorariosEquipo() {
  const { t } = useLanguage();
  return (
    <Page>
      <PageHeader icon={<CalendarClock className="h-5 w-5" />} title={t("hr.horEq.titulo")} subtitle={t("hr.horEq.sub")} />
      <div className="mt-4 flex flex-col gap-4">
        {/* Las modalidades de pausa de la empresa (19/11/2026). */}
        <ModalidadesPausa />
        <section className="vidrio overflow-hidden p-0">
          <ListaHorarios />
        </section>
      </div>
    </Page>
  );
}
