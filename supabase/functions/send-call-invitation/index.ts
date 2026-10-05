// APAGADA (03/10/2026, decisión de Jhon).
//
// Mandaba un correo de «invitación a una llamada» desde el remitente de Maven a
// CUALQUIER lista de direcciones, con el HTML que viniera en el pedido: bastaba
// una cuenta con sesión (también una del registro público) para usar a Maven
// como remitente de phishing. Nadie la usaba: ni el frontend, ni otra edge, ni
// cron, ni funciones SQL, y 0 llamadas en los registros (revisado al apagarla).
//
// Queda como función que responde 410 en vez de borrarla: borrar la carpeta no
// la saca de Supabase (el deploy solo sube lo que existe), y así cualquier
// llamada vieja recibe un «ya no existe» claro. Si algún día hacen falta
// invitaciones por correo, van por el Calendario de Maven (invitaciones del
// correo, corte 2), con destinatarios de la agencia y contenido armado del lado
// del servidor.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "send-call-invitation está desactivada" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
