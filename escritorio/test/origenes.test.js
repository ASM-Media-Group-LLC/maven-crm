'use strict';

// Las reglas de a dónde puede ir la app. Corre con `npm run revisar`.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esDeMaven,
  tienePermisos,
  destinoDeNavegacion,
  destinoDeVentanaNueva,
} = require('../src/origenes');

test('las páginas de Maven se quedan dentro de la app', () => {
  for (const url of [
    'https://app.maven-ai.me/',
    'https://app.maven-ai.me/cowork?sala=1',
    'https://maven-ai.me/',
    'https://www.maven-ai.me/precios',
    'https://oficina.maven-ai.me/editor',
  ]) {
    assert.equal(destinoDeNavegacion(url), 'maven', url);
  }
});

test('lo que se parece a Maven pero no es, sale al navegador', () => {
  for (const url of [
    'http://app.maven-ai.me/', // sin https
    'https://evilmaven-ai.me/',
    'https://app.maven-ai.me.evil.com/',
    'https://app.maven-ai.me@evil.com/',
    'https://app.maven-ai.me:8443/',
    'https://instagram.com/maven',
    'https://lsagslbkliprespbyhts.supabase.co/storage/v1/object/sign/x',
    'https://drive.147-93-3-97.nip.io/archivo?firma=1',
    'mailto:equipo@maven-ai.me',
    'tel:+573000000000',
  ]) {
    assert.equal(destinoDeNavegacion(url), 'externo', url);
    assert.equal(esDeMaven(url), false, url);
  }
});

test('esquemas peligrosos o raros se bloquean', () => {
  for (const url of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'whatsapp://send?text=hola',
    'ms-settings:privacy',
    'no es una url',
    '',
    undefined,
  ]) {
    assert.equal(destinoDeNavegacion(url), 'bloqueado', String(url));
  }
});

test('ventanas nuevas: Maven, blob propios y en blanco van dentro', () => {
  assert.equal(destinoDeVentanaNueva('about:blank'), 'dentro');
  assert.equal(destinoDeVentanaNueva(''), 'dentro');
  assert.equal(destinoDeVentanaNueva('https://app.maven-ai.me/call/sala-1'), 'dentro');
  assert.equal(destinoDeVentanaNueva('https://app.maven-ai.me/hoja/abc'), 'dentro');
  assert.equal(destinoDeVentanaNueva('blob:https://app.maven-ai.me/0f1e2d3c'), 'dentro');
});

test('ventanas nuevas: lo de afuera va al navegador y lo raro se bloquea', () => {
  assert.equal(destinoDeVentanaNueva('https://instagram.com/maven'), 'externo');
  assert.equal(destinoDeVentanaNueva('https://wa.me/573000000000'), 'externo');
  assert.equal(destinoDeVentanaNueva('blob:https://evil.com/0f1e2d3c'), 'bloqueado');
  assert.equal(destinoDeVentanaNueva('file:///C:/Windows/system32/calc.exe'), 'bloqueado');
});

test('cámara, micrófono y pantalla solo para app.maven-ai.me', () => {
  assert.equal(tienePermisos('https://app.maven-ai.me'), true);
  assert.equal(tienePermisos('https://app.maven-ai.me/cowork'), true);
  assert.equal(tienePermisos('https://www.maven-ai.me'), false);
  assert.equal(tienePermisos('https://oficina.maven-ai.me'), false);
  assert.equal(tienePermisos('http://app.maven-ai.me'), false);
  assert.equal(tienePermisos('https://evil.com'), false);
  assert.equal(tienePermisos('file:///Users/x/selector.html'), false);
  assert.equal(tienePermisos(''), false);
});

test('el origen de desarrollo (MAVEN_URL) cuenta como Maven', () => {
  const extras = ['http://localhost:8080'];
  assert.equal(destinoDeNavegacion('http://localhost:8080/cowork', extras), 'maven');
  assert.equal(tienePermisos('http://localhost:8080', extras), true);
  assert.equal(tienePermisos('http://localhost:9999', extras), false);
});
