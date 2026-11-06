// HTML del correo de constancia de tardanza (Alvaro, 06/11). Idéntico al que
// manda la edge detectar-tardanzas: lo tengo también acá para la vista previa en
// /admin/tardanzas y para el botón "mandarme uno de prueba".

export interface DatosCorreoTardanza {
  nombre: string;
  rol: string | null;
  horario: string;   // HH:MM esperado
  entro: string;     // HH:MM real
  tardeMin: number;
  esPrueba?: boolean;
}

function escapar(s: string): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function correoTardanzaHTML(p: DatosCorreoTardanza): string {
  const bannerPrueba = p.esPrueba
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#92400e;text-align:center;font-weight:700">🧪 CORREO DE PRUEBA · nadie fue avisado realmente, es solo para ver cómo se ve</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1222">
<div style="max-width:600px;margin:0 auto;padding:28px 16px 40px">
  ${bannerPrueba}
  <div style="background:#fff;border:1px solid #e7e9f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px -24px rgba(24,21,60,.45)">
    <div style="height:5px;background:linear-gradient(90deg,#6d5efc,#8b78ff)"></div>
    <div style="padding:28px 30px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px">
        <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(140deg,#6d5efc,#8b78ff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:17px">M</div>
        <div><b style="font-size:15px">Maven</b><div style="font-size:12px;color:#6b7183">Argos · Control de asistencia</div></div>
      </div>
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e23d5b;background:#fdeef1;padding:5px 10px;border-radius:999px">⏱ Entrada tarde</span>
      <h1 style="font-size:22px;line-height:1.25;margin:14px 0 6px;font-weight:800">Constancia de entrada tarde</h1>
      <p style="font-size:14px;color:#6b7183;margin:0 0 22px">Se registró una entrada fuera de horario. Esta constancia queda en la tarjeta del empleado y en el historial del día.</p>
      <div style="display:flex;align-items:baseline;gap:10px;background:#f6f7fb;border:1px solid #e7e9f0;border-radius:14px;padding:16px 18px;margin-bottom:22px">
        <span style="font-size:40px;font-weight:800;color:#e23d5b;line-height:1;font-variant-numeric:tabular-nums">${p.tardeMin} min</span>
        <span style="font-size:13px;color:#6b7183;font-weight:600">tarde respecto a su horario</span>
      </div>
      <div style="border:1px solid #e7e9f0;border-radius:14px;overflow:hidden;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;border-bottom:1px solid #e7e9f0"><span style="color:#6b7183">Empleado</span><span style="font-weight:700">${escapar(p.nombre)}${p.rol ? " · " + escapar(p.rol) : ""}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;border-bottom:1px solid #e7e9f0"><span style="color:#6b7183">Horario de entrada</span><span style="font-weight:700;font-variant-numeric:tabular-nums">${p.horario}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px"><span style="color:#6b7183">Entró a las</span><span style="font-weight:700;color:#e23d5b;font-variant-numeric:tabular-nums">${p.entro}</span></div>
      </div>
      <div style="display:flex;gap:10px;background:#fff8f3;border:1px solid #ffe2cf;border-radius:12px;padding:13px 15px;font-size:13px;color:#8a4b1f;line-height:1.5"><span>⚠️</span><span>Estos <b>${p.tardeMin} minutos no se recuperan ni se cobran</b>. La sanción no afecta la nota de Argos: se cuenta aparte, como constancia de asistencia.</span></div>
    </div>
    <div style="text-align:center;padding:18px;font-size:11.5px;color:#9aa0b2;background:#f6f7fb;border-top:1px solid #e7e9f0">Maven · generado automáticamente por Argos</div>
  </div>
</div></body></html>`;
}
