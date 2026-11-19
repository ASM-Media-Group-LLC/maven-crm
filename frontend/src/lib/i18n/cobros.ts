// Cobros, registro solo desde la portada, la puerta (Kash / edificio) y la pantalla de
// bloqueo por pago (tren de agencias, vagón 7 — 19/11/2026).
//
// Las claves empiezan con "cobros." (test/i18n/diccionarioPorModulo.test.ts).
export const PREFIJOS_COBROS = ["cobros."] as const;

export const cobros = {
  // La puerta: el login pide primero el correo.
  "cobros.puerta.continuar": { es: "Continuar", en: "Continue" },
  "cobros.puerta.otroCorreo": { es: "Usar otro correo", en: "Use another email" },
  "cobros.puerta.buscando": { es: "Buscando tu empresa…", en: "Finding your company…" },
  "cobros.puerta.sinRespuesta": {
    es: "No pudimos revisar tu correo ahora. Sigue con tu contraseña de siempre.",
    en: "We couldn't check your email right now. Continue with your usual password.",
  },

  // Portada: los planes Equipo y Empresa.
  "cobros.portada.probarGratis": { es: "Empieza 14 días gratis", en: "Start a 14-day free trial" },
  "cobros.portada.oDemo": { es: "o pide una demo", en: "or request a demo" },

  // /empezar
  "cobros.empezar.titulo": { es: "Empieza tus 14 días gratis", en: "Start your 14-day free trial" },
  "cobros.empezar.sub": {
    es: "Crea tu empresa y pon tu tarjeta. El plan se cobra solo cuando terminen los 14 días; cancela cuando quieras.",
    en: "Create your company and add your card. The plan is charged automatically when the 14 days end; cancel anytime.",
  },
  "cobros.empezar.setup": {
    es: "La instalación (USD {usd}, pago único) se cobra al poner la tarjeta.",
    en: "Setup (USD {usd}, one-time) is charged when you add your card.",
  },
  "cobros.empezar.plan": { es: "Plan", en: "Plan" },
  "cobros.empezar.planEquipo": { es: "Equipo · USD 299 al mes · hasta 20 personas", en: "Team · USD 299/month · up to 20 people" },
  "cobros.empezar.planEmpresa": { es: "Empresa · USD 599 al mes · hasta 50 personas", en: "Business · USD 599/month · up to 50 people" },
  "cobros.empezar.empresa": { es: "Nombre de tu empresa", en: "Company name" },
  "cobros.empezar.nombre": { es: "Tu nombre", en: "Your name" },
  "cobros.empezar.correo": { es: "Tu correo", en: "Your email" },
  "cobros.empezar.contrasena": { es: "Contraseña (mínimo 8)", en: "Password (at least 8)" },
  "cobros.empezar.boton": { es: "Seguir a la tarjeta", en: "Continue to card" },
  "cobros.empezar.creando": { es: "Creando tu empresa…", en: "Creating your company…" },
  "cobros.empezar.demo": { es: "¿Prefieres que te lo mostremos? Agenda una demo", en: "Prefer a walkthrough? Book a demo" },
  "cobros.empezar.yaTengo": { es: "¿Ya tienes cuenta? Inicia sesión", en: "Already have an account? Sign in" },
  "cobros.empezar.cancelado": {
    es: "No se completó el pago. Tu empresa quedó guardada: entra con tu correo y termina de poner la tarjeta.",
    en: "The payment wasn't completed. Your company is saved: sign in with your email and finish adding your card.",
  },
  "cobros.empezar.apagado": {
    es: "El registro todavía no está abierto. Pide una demo y te damos acceso.",
    en: "Sign-up isn't open yet. Request a demo and we'll give you access.",
  },
  "cobros.error.plan_invalido": { es: "Elige un plan.", en: "Choose a plan." },
  "cobros.error.empresa_invalida": { es: "Escribe el nombre de tu empresa.", en: "Enter your company name." },
  "cobros.error.nombre_invalido": { es: "Escribe tu nombre.", en: "Enter your name." },
  "cobros.error.correo_invalido": { es: "Ese correo no es válido.", en: "That email isn't valid." },
  "cobros.error.correo_de_kash": {
    es: "Ese correo ya es de un equipo con Maven. Entra desde «Iniciar sesión».",
    en: "That email already belongs to a Maven team. Use “Sign in”.",
  },
  "cobros.error.contrasena_corta": { es: "La contraseña necesita al menos 8 caracteres.", en: "The password needs at least 8 characters." },
  "cobros.error.correo_en_uso": {
    es: "Ya hay una cuenta con ese correo. Inicia sesión o usa otro correo.",
    en: "There's already an account with that email. Sign in or use another email.",
  },
  "cobros.error.demasiados_intentos": { es: "Demasiados intentos. Espera un rato y vuelve a intentarlo.", en: "Too many attempts. Wait a while and try again." },
  "cobros.error.cobros_sin_preparar": {
    es: "Los pagos todavía no están listos. Pide una demo y te damos acceso.",
    en: "Payments aren't ready yet. Request a demo and we'll give you access.",
  },
  "cobros.error.general": {
    es: "No pudimos crear tu empresa. No se cobró nada; vuelve a intentarlo en un momento.",
    en: "We couldn't create your company. Nothing was charged; try again in a moment.",
  },

  // /bienvenido
  "cobros.bienvenido.titulo": { es: "¡Tu empresa ya está en Maven!", en: "Your company is on Maven!" },
  "cobros.bienvenido.sub": {
    es: "Tus 14 días gratis empezaron hoy. Entra con tu correo y tu contraseña para invitar a tu equipo.",
    en: "Your 14 free days started today. Sign in with your email and password to invite your team.",
  },
  "cobros.bienvenido.entrar": { es: "Entrar a Maven", en: "Go to Maven" },

  // Pantalla de bloqueo (al entrar).
  "cobros.bloqueo.titulo.pago": { es: "Tu empresa está bloqueada por pago pendiente", en: "Your company is blocked due to a pending payment" },
  "cobros.bloqueo.titulo.falta_tarjeta": { es: "Falta poner la tarjeta", en: "Your card is missing" },
  "cobros.bloqueo.titulo.pausada": { es: "Tu empresa está en pausa", en: "Your company is paused" },
  "cobros.bloqueo.titulo.agencia_pausada": { es: "Tu equipo está en pausa", en: "Your team is paused" },
  "cobros.bloqueo.titulo.archivada": { es: "Esta cuenta ya no está activa", en: "This account is no longer active" },
  "cobros.bloqueo.sub.pago": {
    es: "No se pudo cobrar el plan y pasaron los días de gracia. No se borró nada: al pagar, todo vuelve como estaba.",
    en: "The plan couldn't be charged and the grace period is over. Nothing was deleted: once you pay, everything comes back as it was.",
  },
  "cobros.bloqueo.sub.falta_tarjeta": {
    es: "Tu empresa está creada. Pon tu tarjeta para empezar los 14 días gratis.",
    en: "Your company is ready. Add your card to start the 14 free days.",
  },
  "cobros.bloqueo.sub.pausada": { es: "Maven pausó esta cuenta. Escríbenos y la revisamos contigo.", en: "Maven paused this account. Write to us and we'll review it with you." },
  "cobros.bloqueo.sub.agencia_pausada": { es: "El administrador de tu empresa pausó este equipo. Habla con él.", en: "Your company's admin paused this team. Talk to them." },
  "cobros.bloqueo.sub.archivada": { es: "Si crees que es un error, habla con el administrador de tu empresa.", en: "If you think this is a mistake, talk to your company's admin." },
  "cobros.bloqueo.pagar": { es: "Pagar ahora", en: "Pay now" },
  "cobros.bloqueo.ponerTarjeta": { es: "Poner tarjeta", en: "Add card" },
  "cobros.bloqueo.pideleAlAdmin": {
    es: "Pídele al administrador de tu empresa que actualice el pago.",
    en: "Ask your company's admin to update the payment.",
  },
  "cobros.bloqueo.salir": { es: "Cerrar sesión", en: "Sign out" },
  "cobros.bloqueo.abriendo": { es: "Abriendo el pago…", en: "Opening payment…" },
  "cobros.bloqueo.errorPago": {
    es: "No pudimos abrir el pago. Vuelve a intentarlo en un momento.",
    en: "We couldn't open the payment. Try again in a moment.",
  },
  "cobros.gracia.aviso": {
    es: "No pudimos cobrar el plan. Tienes hasta el {fecha} para actualizar la tarjeta.",
    en: "We couldn't charge the plan. You have until {fecha} to update your card.",
  },
} as const;
