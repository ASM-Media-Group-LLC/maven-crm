'use strict';

// El selector de pantalla. Los nombres de las ventanas vienen de OTRAS apps:
// todo va con textContent, nunca como HTML.

(async () => {
  const $ = (id) => document.getElementById(id);
  const datos = await window.selector.datos();
  if (!datos) {
    window.selector.cancelar();
    return;
  }
  const t = datos.textos;
  let tipo = 'pantalla';
  let elegida = null;

  document.title = t.titulo;
  $('titulo').textContent = t.titulo;
  $('tab-pantalla').textContent = t.pantallas;
  $('tab-ventana').textContent = t.ventanas;
  $('cancelar').textContent = t.cancelar;
  $('compartir').textContent = t.compartir;
  $('vacio').textContent = t.sinFuentes;

  if (datos.audio) {
    $('audio').hidden = false;
    $('audio-texto').textContent = t.conAudio;
  }

  if (datos.permisoMac !== 'granted') {
    $('permiso').hidden = false;
    $('permiso-texto').textContent = t.permisoMac;
    $('permiso-boton').textContent = t.abrirAjustes;
    $('permiso-boton').addEventListener('click', () => window.selector.abrirAjustes());
  }

  const compartir = () => {
    if (elegida) window.selector.elegir(elegida, $('audio-casilla').checked);
  };

  function pintar() {
    for (const tab of document.querySelectorAll('.pestanas button')) {
      tab.setAttribute('aria-selected', String(tab.dataset.tipo === tipo));
    }
    const lista = $('lista');
    lista.replaceChildren();
    const fuentes = datos.fuentes.filter((f) => f.tipo === tipo);
    $('vacio').hidden = fuentes.length > 0;
    lista.hidden = fuentes.length === 0;

    fuentes.forEach((fuente, i) => {
      const tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = 'fuente';
      tarjeta.setAttribute('role', 'option');
      tarjeta.setAttribute('aria-selected', String(fuente.id === elegida));

      const miniatura = document.createElement('img');
      miniatura.className = 'miniatura';
      miniatura.alt = '';
      if (fuente.miniatura) miniatura.src = fuente.miniatura;
      tarjeta.append(miniatura);

      const nombre = document.createElement('div');
      nombre.className = 'nombre';
      if (fuente.icono) {
        const icono = document.createElement('img');
        icono.alt = '';
        icono.src = fuente.icono;
        nombre.append(icono);
      }
      const texto = document.createElement('span');
      // Las pantallas llegan en inglés («Entire screen», «Screen 1»): se numeran.
      texto.textContent = fuente.tipo === 'pantalla' ? t.pantalla.replace('{n}', String(i + 1)) : fuente.nombre;
      texto.title = texto.textContent;
      nombre.append(texto);
      tarjeta.append(nombre);

      tarjeta.addEventListener('click', () => {
        elegida = fuente.id;
        $('compartir').disabled = false;
        for (const otra of lista.children) otra.setAttribute('aria-selected', String(otra === tarjeta));
      });
      tarjeta.addEventListener('dblclick', () => {
        elegida = fuente.id;
        compartir();
      });
      lista.append(tarjeta);
    });
  }

  for (const tab of document.querySelectorAll('.pestanas button')) {
    tab.addEventListener('click', () => {
      tipo = tab.dataset.tipo;
      pintar();
    });
  }
  $('cancelar').addEventListener('click', () => window.selector.cancelar());
  $('compartir').addEventListener('click', compartir);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.selector.cancelar();
    if (e.key === 'Enter' && elegida) compartir();
  });

  // Si hay una sola pantalla, ya va elegida: es lo que pide Cowork.
  const pantallas = datos.fuentes.filter((f) => f.tipo === 'pantalla');
  if (pantallas.length === 1) {
    elegida = pantallas[0].id;
    $('compartir').disabled = false;
  }
  pintar();
  $('compartir').focus();
})();
