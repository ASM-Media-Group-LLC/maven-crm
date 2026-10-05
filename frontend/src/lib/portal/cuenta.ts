// ¿Es la cuenta de una creadora (portal de creadoras) o de alguien del equipo?
//
// La marca la pone SOLO el servidor (edge portal-creadoras: app_metadata.tipo =
// 'creadora'); quien se registra no puede escribir app_metadata. Ver
// supabase/migrations/20261005140100_cuentas_externas_y_avisos.sql.
//
// La usan las rutas: una creadora nunca entra al CRM (ProtectedRoute la manda a
// /portal) y alguien del equipo nunca ve el portal (PortalLayout lo manda a
// /dashboard). Lo que protege los datos es la base; esto evita pantallas rotas.
interface ConMetadatos {
  app_metadata?: Record<string, unknown> | null;
}

export function esCuentaDeCreadora(user: ConMetadatos | null | undefined): boolean {
  return (user?.app_metadata as { tipo?: unknown } | null | undefined)?.tipo === "creadora";
}
