#!/usr/bin/env python3
"""VER A TODOS EN LAS SALAS DE COWORK, SIN RECARGAR (14/11/2026).

El 13/11 (PR #99) la sala de trabajo de Cowork dejó de descargar el video de los
compañeros, salvo el de quien trae `isHost: true` en su metadata
(frontend/src/lib/videoAjeno.ts). Alvaro lo revirtió el 14/11 (PR #101), pero las
pestañas que no recargaron siguen con ese código y ven «Solo audio».

Desde el 14/11 cowork-session pone `isHost: true` en la metadata de todos los que
entran a una sala de trabajo (ver createLKToken). Este script hace lo mismo con los
que YA estaban conectados: les cambia SOLO la metadata (no los permisos, no los
saca de la sala) y esas pestañas vuelven a ver a todos en el siguiente repaso
(~3 s). Nadie más lee `isHost` de la metadata.

Corre en el servidor de LiveKit (lee la llave de /opt/maven-livekit/livekit.yaml y
no la imprime):
    python3 ver-a-todos.py            # solo cuenta lo que haría
    python3 ver-a-todos.py --aplicar  # lo hace
"""
import base64
import hashlib
import hmac
import json
import re
import sys
import time
import urllib.request

CONFIG = "/opt/maven-livekit/livekit.yaml"
URL = "http://127.0.0.1:7880/twirp/livekit.RoomService/"
NO_ES_DE_TRABAJO = re.compile(r"^cowork_(hub|meet|1on1)_")


def llave():
    dentro = False
    with open(CONFIG, encoding="utf-8") as f:
        for linea in f:
            if linea.startswith("keys:"):
                dentro = True
                continue
            if dentro:
                m = re.match(r"^\s+([A-Za-z0-9_]+):\s*(\S+)\s*$", linea)
                if m:
                    return m.group(1), m.group(2)
                if not linea.startswith(" "):
                    break
    raise SystemExit("no encontré la llave en " + CONFIG)


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token(api_key, secreto, sala=None):
    ahora = int(time.time())
    video = {"roomList": True}
    if sala:
        video = {"roomAdmin": True, "room": sala}
    carga = {"iss": api_key, "sub": "repaso-ver-a-todos", "nbf": ahora, "iat": ahora, "exp": ahora + 300, "video": video}
    cab = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    cuerpo = b64(json.dumps(carga).encode())
    firma = hmac.new(secreto.encode(), f"{cab}.{cuerpo}".encode(), hashlib.sha256).digest()
    return f"{cab}.{cuerpo}.{b64(firma)}"


def llamar(metodo, datos, tk):
    req = urllib.request.Request(URL + metodo, data=json.dumps(datos).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + tk})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read() or b"{}")


def main():
    aplicar = "--aplicar" in sys.argv
    api_key, secreto = llave()
    salas = llamar("ListRooms", {}, token(api_key, secreto)).get("rooms", [])
    de_trabajo = [s["name"] for s in salas if s.get("name", "").startswith("cowork_") and not NO_ES_DE_TRABAJO.match(s["name"])]
    total = cambiados = errores = 0
    for sala in de_trabajo:
        tk = token(api_key, secreto, sala)
        for p in llamar("ListParticipants", {"room": sala}, tk).get("participants", []):
            total += 1
            try:
                meta = json.loads(p.get("metadata") or "{}")
            except ValueError:
                continue  # metadata que no es nuestra (grabación, etc.): no se toca
            if not isinstance(meta, dict) or meta.get("isHost") is True:
                continue
            meta["isHost"] = True
            if aplicar:
                try:
                    llamar("UpdateParticipant", {"room": sala, "identity": p["identity"], "metadata": json.dumps(meta)}, tk)
                except Exception:  # noqa: BLE001 — uno que se fue en el medio no frena el resto
                    errores += 1
                    continue
            cambiados += 1
    modo = "cambiados" if aplicar else "por cambiar (sin --aplicar no se toca nada)"
    print(f"salas de trabajo: {len(de_trabajo)} · conectados: {total} · {modo}: {cambiados} · errores: {errores}")


if __name__ == "__main__":
    main()
