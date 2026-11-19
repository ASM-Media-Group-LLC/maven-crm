#!/bin/bash
# SIMULACRO — una noche completa (≈ 70 min). Corre en el VPS de pruebas
# (144.126.155.175), NUNCA contra producción: sim.env apunta a la copia.
#   Fase 1 · carga: 1000 personas a la vez desde 10 ciudades, internet bueno
#   Fase 2 · internet: malo / cortes / sin internet (Madrid, Bogotá, Miami)
#   Fase 3 · tiempo real del Messenger con las 4 condiciones
#   Fase 4 · llamadas (LiveKit de pruebas en este mismo VPS) bueno / malo / cortes
set -u
cd /opt/simulacro
source ./sim.env
case "$SIM_URL" in *lsagslbkliprespbyhts*) echo "NUNCA contra producción"; exit 1;; esac
NOCHE=$(date -u +%Y-%m-%d)
R=/opt/simulacro/resultados/$NOCHE
mkdir -p "$R"
exec > >(tee -a "$R/bitacora.txt") 2>&1
echo "== Simulacro $NOCHE — empieza $(date -u +%H:%M) UTC"

declare -A RTT=( [frankfurt]=55 [londres]=45 [madrid]=60 [bogota]=30 [mexico]=20 [saopaulo]=65 [santiago]=75 [miami]=10 [nuevayork]=5 [losangeles]=30 )
CIUDADES=(frankfurt londres madrid bogota mexico saopaulo santiago miami nuevayork losangeles)

persona() { # nombre ciudad cond salida -- comando...
  local nombre=$1 ciudad=$2 cond=$3; shift 3
  docker run -d --rm --name "$nombre" --cap-add NET_ADMIN \
    --env-file ./sim.env -e REGION="$ciudad" -e COND="$cond" -e RTT_MS="${RTT[$ciudad]}" \
    -v /opt/simulacro:/sim:ro -v "$R":/resultados sim-persona "$@" >/dev/null
}
esperar() { while [ -n "$(docker ps -q --filter name=sim-)" ]; do sleep 15; done; }

# ── Fase 1: carga total ────────────────────────────────────────────────
echo "-- Fase 1: 1000 personas, 10 ciudades, internet bueno"
i=0
for c in "${CIUDADES[@]}"; do
  persona "sim-carga-$c" "$c" bueno k6 run -q -e PARTES=10 -e PARTE=$i -e VUS=100 -e SUBIDA=3m -e DURACION=10m \
    -e SALIDA=/resultados/carga__${c}__bueno.json /sim/maven.js
  i=$((i+1))
done
esperar

# ── Fase 2: internet malo, cortes y sin internet ───────────────────────
for cond in malo cortes sin_internet; do
  echo "-- Fase 2: $cond"
  i=0
  for c in madrid bogota miami; do
    persona "sim-red-$c" "$c" "$cond" k6 run -q -e PARTES=3 -e PARTE=$i -e VUS=80 -e SUBIDA=1m -e DURACION=5m \
      -e SALIDA=/resultados/red__${c}__${cond}.json /sim/maven.js
    i=$((i+1))
  done
  esperar
done

# ── Fase 3: tiempo real del Messenger ──────────────────────────────────
for cond in bueno malo cortes sin_internet; do
  echo "-- Fase 3: tiempo real, $cond"
  i=0
  for c in madrid bogota miami; do
    persona "sim-vivo-$c" "$c" "$cond" k6 run -q -e PARTES=3 -e PARTE=$i -e VUS=20 -e DURACION=5m \
      -e SALIDA=/resultados/vivo__${c}__${cond}.json /sim/tiempo_real.js
    i=$((i+1))
  done
  esperar
done

# ── Fase 4: llamadas (salas tipo Cowork) ───────────────────────────────
docker rm -f sim-livekit >/dev/null 2>&1
docker run -d --rm --name sim-livekit --network host livekit/livekit-server:v1.8.4 --dev --bind 0.0.0.0 >/dev/null
sleep 8
IP=$(hostname -I | awk '{print $1}')
for cond in bueno malo cortes; do
  echo "-- Fase 4: llamadas, $cond"
  for c in madrid bogota miami; do
    persona "sim-llamada-$c" "$c" "$cond" bash -c "lk load-test --url ws://$IP:7880 --api-key devkey --api-secret secret \
      --room sala-$c-$cond --video-publishers 6 --audio-publishers 8 --subscribers 10 --video-resolution medium \
      --duration 3m > /resultados/llamada__${c}__${cond}.txt 2>&1"
  done
  esperar
done
docker rm -f sim-livekit >/dev/null 2>&1

echo "== Terminó $(date -u +%H:%M) UTC"
python3 /opt/simulacro/agrega.py "$R" > "$R/semaforo.json" && echo "semaforo listo"
