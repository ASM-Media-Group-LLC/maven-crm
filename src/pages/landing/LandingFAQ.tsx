import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "¿Qué tipo de agencias pueden usar Maven?",
    a: "Maven está diseñado para agencias de creadores de contenido de cualquier tamaño. Desde agencias con 5 creadores hasta operaciones con 500+, la plataforma se adapta a tus necesidades.",
  },
  {
    q: "¿Necesito activar todos los módulos?",
    a: "No. Puedes usar solo los módulos que necesitas. Por ejemplo, puedes empezar con Gestión de Creadores y Sales, y luego activar HR o Finanzas cuando tu equipo crezca.",
  },
  {
    q: "¿Cómo funciona el sistema de roles y permisos?",
    a: "Maven tiene un sistema granular de roles personalizables. Puedes crear roles como Manager, Chatter, Closer, Admin, etc., y asignar permisos específicos por módulo a cada uno.",
  },
  {
    q: "¿Se puede integrar con otras herramientas?",
    a: "Sí. Maven se integra con plataformas de contenido, herramientas de comunicación y sistemas financieros. Además, nuestro Messenger interno y AI Chat reducen la necesidad de herramientas externas.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Absolutamente. Maven usa cifrado de extremo a extremo, autenticación segura, Row Level Security en la base de datos y auditoría completa de cada acción. Tus datos son solo tuyos.",
  },
];

const LandingFAQ = () => (
  <section id="faq" className="py-20">
    <div className="mx-auto max-w-3xl px-4">
      <h2 className="mb-3 animate-fade-in-up text-center text-2xl font-bold text-white md:text-3xl">
        Preguntas frecuentes
      </h2>
      <p className="mx-auto mb-10 max-w-xl text-center text-white/50">
        Todo lo que necesitas saber para empezar.
      </p>
      <Accordion type="single" collapsible className="space-y-3">
        {faqs.map((faq, i) => (
          <AccordionItem
            key={i}
            value={`faq-${i}`}
            className="glass-card-subtle animate-fade-in-up overflow-hidden rounded-xl border-white/[0.06] px-5"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <AccordionTrigger className="text-left text-sm font-medium text-white hover:no-underline [&>svg]:text-white/40">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-white/55">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

export default LandingFAQ;
