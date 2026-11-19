#!/bin/bash
# SIMULACRO DE LLAMADAS — Cowork de Maven con navegadores de verdad (Chrome),
# contra la RÉPLICA del servidor de llamadas de producción (este VPS) y la
# COPIA de Maven. Nada toca producción.
#   1 · Llamadas de 2 con distintos internets y lugares
#   2 · Sala de Cowork de 10 personas, cada una con su internet
#   3 · Sala grande de 25 (10 navegadores + 15 sintéticos) con pantalla compartida
#   4 · El techo del servidor (sintéticos hasta que se degrade)
#   5 · Llamada larga de 60 minutos (solo si LARGA=1)
# Mide también qué tan ocupado está ESTE servidor: si pasa del 85 %, esa prueba
# se marca como «no válida» (los congelamientos serían del probador, no de Maven).
set -u
cd /opt/simulacro
source ./sim.env
case "$SIM_URL" in *lsagslbkliprespbyhts*) echo "NUNCA contra producción"; exit 1;; esac
R=/opt/simulacro/resultados/llamadas-$(date -u +%Y-%m-%d_%H%M)
mkdir -p "$R"
exec > >(tee -a "$R/bitacora.txt") 2>&1
echo "== Llamadas — empieza $(date -u +%H:%M) UTC"
declare -A RTT=( [frankfurt]=55 [londres]=45 [madrid]=60 [bogota]=30 [mexico]=20 [saopaulo]=65 [santiago]=75 [miami]=10 [nuevayork]=5 [losangeles]=30 )

# Sesión de Cowork nueva, creada por un supervisor de prueba con la función real.
T=$(curl -s "$SIM_URL/auth/v1/token?grant_type=password" -H "apikey: $SIM_ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"sim0160@simulacro.maven.test\",\"password\":\"$SIM_PASS\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
SES=$(curl -s "$SIM_URL/functions/v1/cowork-session" -H "apikey: $SIM_ANON" -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"action":"createSession","name":"Simulacro llamadas","roomNames":["P1","P2","P3","P4","P5","P6","P7","Cowork 10","Sala 25","Larga 60"]}')
echo "$SES" > "$R/sesion.json"
SESSION=$(echo "$SES" | python3 -c "import sys,json;print(json.load(sys.stdin)['sessionId'])")
sala() { echo "$SES" | python3 -c "import sys,json;print([r for r in json.load(sys.stdin)['rooms'] if r['name']=='$1'][0]['$2'])"; }

cpu() { # muestra el uso de CPU del servidor cada 5 s mientras haya pruebas
  ( while [ -n "$(docker ps -q --filter name=sim-nav-)$(docker ps -q --filter name=sim-sint-)" ]; do
      echo "$(date -u +%s) $(top -bn1 | awk '/Cpu\(s\)/{print 100-$8}')" >> "$R/cpu_$1.txt"; sleep 5; done ) &
}
navegador() { # persona sala cond ciudad escenario duracion [compartir]
  local p=$1 room=$2 cond=$3 ciudad=$4 esc=$5 dur=$6 comp=${7:-0}
  docker run -d --rm --name "sim-nav-$p" --cap-add NET_ADMIN --shm-size=1g --env-file ./sim.env \
    -e PERSONA=$p -e COND=$cond -e RTT_MS=${RTT[$ciudad]} -e REGION=$ciudad -e ESCENARIO=$esc -e MODO_PASE=plan_b \
    -e SESSION=$SESSION -e ROOM=$room -e DURACION_S=$dur -e COMPARTIR_PANTALLA=$comp -e SALIDA=/resultados/${esc}__${p}.json \
    -v /opt/simulacro/navegador.mjs:/app/navegador.mjs:ro -v "$R":/resultados sim-navegador node /app/navegador.mjs >/dev/null
}
sinteticos() { # sala_livekit cuantos cond ciudad duracion nombre
  docker run -d --rm --name "sim-sint-$6" --cap-add NET_ADMIN -e COND=$3 -e RTT_MS=${RTT[$4]} sim-persona bash -c \
    "lk load-test --url ws://144.126.155.175:7880 --api-key $SIM_LK_KEY --api-secret $SIM_LK_SECRET --room $1 \
     --video-publishers $2 --audio-publishers $2 --subscribers 0 --video-resolution medium --duration ${5}s \
     > /dev/null 2>&1" >/dev/null
}
esperar() { while [ -n "$(docker ps -q --filter name=sim-nav-)$(docker ps -q --filter name=sim-sint-)" ]; do sleep 10; done; }

# ── 1 · Llamadas de 2 (3 parejas a la vez, en salas distintas) ─────────
P=(218 219 220 221 222 223 224 225 226 227 228 229 230 231)
pareja() { # n_sala p1 cond1 ciudad1 p2 cond2 ciudad2 nombre
  navegador $2 "$(sala "P$1" id)" $3 $4 "dos_$8" 180; navegador $5 "$(sala "P$1" id)" $6 $7 "dos_$8" 180
}
echo "-- 1a: llamadas de 2"
pareja 1 218 bueno bogota 219 bueno bogota bueno
pareja 2 220 bueno bogota 221 3g bogota con3g
pareja 3 222 4g madrid 223 4g miami europa_eeuu
cpu dos_a; esperar
echo "-- 1b: llamadas de 2 (internet difícil)"
pareja 4 224 sin_udp bogota 225 bueno miami sin_udp
pareja 5 226 corte5 bogota 227 bueno bogota corte5
pareja 6 228 corte30 madrid 229 bueno bogota corte30
cpu dos_b; esperar
echo "-- 1c: llamadas de 2 (poco ancho y wifi malo)"
pareja 7 230 1mbps santiago 231 wifi_perdidas saopaulo bajo_ancho
cpu dos_c; esperar

# ── 2 · Cowork de 10, cada uno con su internet ─────────────────────────
echo "-- 2: Cowork de 10"
C10=$(sala "Cowork 10" id); i=0
for spec in "bueno bogota" "bueno miami" "bueno madrid" "4g mexico" "4g londres" "3g bogota" "wifi_perdidas saopaulo" "sin_udp nuevayork" "corte5 frankfurt" "bueno santiago"; do
  set -- $spec; navegador $((300+i)) "$C10" $1 $2 cowork10 240; i=$((i+1))
done
cpu cowork10; esperar

# ── 3 · Sala grande de 25 con pantalla compartida ──────────────────────
echo "-- 3: sala de 25"
S25=$(sala "Sala 25" id); S25LK=$(sala "Sala 25" livekit_room_name); i=0
for spec in "bueno bogota 1" "bueno madrid 0" "4g miami 0" "bueno mexico 0" "3g bogota 0" "wifi_perdidas saopaulo 0" "bueno londres 0" "corte5 santiago 0" "sin_udp nuevayork 0" "bueno losangeles 0"; do
  set -- $spec; navegador $((320+i)) "$S25" $1 $2 sala25 240 $3; i=$((i+1))
done
sinteticos "$S25LK" 15 bueno miami 240 sala25
cpu sala25; esperar

# ── 4 · Techo del servidor (sintéticos) ────────────────────────────────
echo "-- 4: techo"
for n in 50 100 150 200; do
  docker run --rm --name sim-sint-techo -e COND=bueno -e RTT_MS=10 sim-persona bash -c \
    "lk load-test --url ws://144.126.155.175:7880 --api-key $SIM_LK_KEY --api-secret $SIM_LK_SECRET --room techo-$n \
     --video-publishers $((n/5)) --audio-publishers $((n/5)) --subscribers $((n - n/5)) --video-resolution medium --duration 90s" \
     > "$R/techo_$n.txt" 2>&1 &
  echo "$(date -u +%s) $(top -bn1 | awk '/Cpu\(s\)/{print 100-$8}')" >> "$R/cpu_techo_$n.txt"
  wait
  docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemUsage}}" sim-lk >> "$R/cpu_techo_$n.txt" 2>/dev/null
done

# ── 5 · Llamada larga ──────────────────────────────────────────────────
if [ "${LARGA:-0}" = "1" ]; then
  echo "-- 5: llamada larga 60 min"
  L=$(sala "Larga 60" id); i=0
  for spec in "bueno bogota" "bueno madrid" "4g miami" "wifi_perdidas mexico"; do
    set -- $spec; navegador $((340+i)) "$L" $1 $2 larga60 3600; i=$((i+1))
  done
  cpu larga60; esperar
fi
echo "== Terminó $(date -u +%H:%M) UTC · resultados en $R"
