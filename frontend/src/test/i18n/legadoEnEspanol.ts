// LA LISTA DE LO QUE TODAVÍA ESTÁ EN ESPAÑOL A MANO.
//
// Maven se escribió en español con el texto metido dentro de cada pantalla, así
// que el botón ES/EN de la barra superior nunca pudo traducir casi nada: de los
// ~4.300 textos visibles de la app, el diccionario cubría el 8 %. La auditoría
// de i18n (sep 2026) encontró además POR QUÉ el menú, que sí se había traducido,
// volvió a estar en español: no había nada que avisara. Cada módulo nuevo entró
// con sus títulos escritos a mano y nadie se enteró hasta abrir la app en EN.
//
// Esta lista es ese aviso. `sinEspanolNuevo.test.ts` deja pasar el texto español
// de los archivos que están acá —son los que ya estaban así— y falla para
// cualquier otro. O sea: **una pantalla nueva no puede nacer en español**.
//
// LA LISTA SOLO PUEDE ACHICARSE. Cuando traduzcas un módulo, borrá sus archivos
// de acá en el mismo PR; el test te avisa si te olvidás (falla diciendo que el
// archivo ya está limpio pero sigue anotado). Si un archivo tuyo aparece en el
// error del test y NO está en esta lista, no lo agregues: pasá su texto por
// `t()`. Agregar una línea acá es aceptar que esa pantalla no habla inglés.
//
// Un archivo acá adentro puede seguir sumando español: son los que están en cola
// para traducirse igual. Lo que la lista garantiza es que el problema no se
// EXTIENDA a archivos nuevos.
export const LEGADO_EN_ESPANOL: string[] = [
  // Traducido en pantalla: ReportScheduleModal dibuja admin.metric.<key> (etiquetasMetricas.ts); el `label` queda en español como respaldo y lo ata adminEnIngles.test.tsx al `es` del diccionario.
  "hooks/reportMetricsCatalog.ts",
  // Traducido; quedan los criterios originales del scorecard (ORIGINAL_CRITERIA), que se guardan en la base con su label_en al lado: son dato.
  "hooks/useChatterEvaluator.ts",
  // Código muerto: nadie lo importa (lo reemplazaron el Dashboard y QA History de AgencyQA.tsx). Se traduce o se borra aparte.
  "pages/agency-qa/AgencyCalls.tsx",
  // Código muerto: nadie lo importa (el detalle vive en CallDetailPage.tsx, ya traducido). Se traduce o se borra aparte.
  "pages/agency-qa/CallDetailDrawer.tsx",
  // Traducido; queda el error_message que se guarda en chatter_qa_reports cuando la edge no responde: es dato, lo lee cualquiera.
  "pages/agency-qa/chatters-qa/useChatterQaReports.ts",
  // Traducido; queda un nombre propio con ñ en la lista de asignables («Castaño»), que no es texto de pantalla.
  "pages/creadores/CreateTicketModal.tsx",
  // Traducido; quedan el título de la notificación y la acción del historial, que se guardan y los leen otras personas.
  "pages/creadores/VerificationSection.tsx",
  // Traducido; quedan `category`/`title` del catálogo: se guardan en creator_guidelines y se comparan con la base (DATO). Se muestra `label`.
  "pages/creadores/lineamientos/categoriesConfig.ts",
  // Traducido; quedan las notificaciones y la descripción de los documentos, que se guardan y las leen otras personas.
  "pages/creadores/onboarding/OnboardingWizard.tsx",
  // Traducido; queda la notificación de inactividad, que se guarda y la lee el manager asignado.
  "pages/creadores/onboarding/useOnboarding.ts",
  // Es la factura en sí (se exporta a PDF y la recibe la creadora): un documento, no pantalla. Va en español a propósito.
  "pages/finanzas/facturacion/InvoiceA4Preview.tsx",
  // Es la nota de pago en sí (el documento que recibe la creadora; también la vista previa al crearla). Va en español a propósito.
  "pages/finanzas/facturacion/PaymentNoteA4Preview.tsx",
  // Traducido; queda la checklist por defecto (categoría/título/descripción) y los motivos de salida: se guardan en employee_offboarding_tasks / termination_reason y los lee quien lleve el offboarding. Se ven traducidos.
  "pages/hr/HROffboardingNew.tsx",
  // Traducido; queda la checklist por defecto (categoría/título/descripción): se guarda en employee_onboarding_tasks y la lee quien lleve el onboarding. Se ve traducida.
  "pages/hr/HROnboardingNew.tsx",
  // Traducido; queda la lámina (días, formato, rótulos, título y regla de ejecución): es el documento que se imprime y se manda al grupo, lo leen las creadoras.
  "pages/parrilla/ParrillaPage.tsx",
  // Traducido; quedan los días de la lámina y el título por defecto de cada acción extra y de la parrilla, que se guardan e imprimen en el documento.
  "pages/parrilla/useParrilla.ts",
  // Traducido; queda «Link de Instagram», la pregunta que se guarda en ticket_form_fields y la leen todos: no se traduce.
  "pages/tickets/TicketFormEditor.tsx",
  // Traducido; queda un nombre propio con ñ en TEAM_MEMBERS («Castaño»), que no es texto de pantalla.
  "pages/tickets/useTickets.ts",
];
