'use strict';

// Se muestra cuando Maven no cargó (sin internet). Reintenta solo cada 10 s y
// vuelve a la página donde estaba. Los textos llegan en la URL desde la app.
(() => {
  const q = new URLSearchParams(location.search);
  const volver = q.get('volver') || 'https://app.maven-ai.me/';
  document.getElementById('titulo').textContent = q.get('titulo') || '';
  document.getElementById('detalle').textContent = q.get('detalle') || '';
  const boton = document.getElementById('reintentar');
  boton.textContent = q.get('reintentar') || '↻';

  // La regla de navegación de la app solo deja ir a Maven: si `volver` fuera
  // otra cosa, la navegación se bloquea y no pasa nada.
  const ir = () => location.replace(volver);
  boton.addEventListener('click', ir);
  setInterval(() => { if (navigator.onLine) ir(); }, 10_000);
  window.addEventListener('online', ir);
})();
