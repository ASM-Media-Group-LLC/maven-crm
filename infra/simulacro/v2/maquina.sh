#!/bin/bash
# SIMULACRO v2 — lo que corre en CADA máquina de prueba (Vultr: Miami, Madrid,
# São Paulo, Ciudad de México). Las personas salen de ese país DE VERDAD; el
# internet malo / cortes / sin UDP se imita encima con red.sh.
#   maquina.sh preparar
#   maquina.sh nav <persona> <sala_id> <cond> <escenario> <segundos> <compartir 0|1>
#   maquina.sh k6 <script> <nombre> <args...>
#   maquina.sh cpu <etiqueta>      (muestrea la CPU cada 5 s mientras haya pruebas)
#   maquina.sh esperar
set -u
cd /opt/sim
source ./sim.env
case "$SIM_URL" in *lsagslbkliprespbyhts*) echo "NUNCA contra producción"; exit 1;; esac
R=/opt/sim/resultados; mkdir -p "$R"; chmod 777 "$R"
REGION=$(hostname | sed 's/^sim-//')
case "$1" in
  preparar)
    docker build -q -t sim-navegador -f Dockerfile.navegador . >/dev/null && docker pull -q grafana/k6:0.54.0 >/dev/null && echo "preparada $REGION" ;;
  nav)
    p=$2 room=$3 cond=$4 esc=$5 dur=$6 comp=${7:-0}
    docker rm -f "sim-nav-$p" >/dev/null 2>&1
    docker run -d --rm --name "sim-nav-$p" --cap-add NET_ADMIN --shm-size=1g --env-file ./sim.env \
      -e PERSONA=$p -e COND=$cond -e RTT_MS=1 -e REGION=$REGION -e ESCENARIO=$esc -e MODO_PASE=plan_b \
      -e HOST_WEB=144.126.155.175 -e SESSION="$SESSION" -e ROOM=$room -e DURACION_S=$dur -e COMPARTIR_PANTALLA=$comp \
      -e SALIDA=/resultados/${esc}__${REGION}__${cond}__${p}.json \
      -v /opt/sim/navegador.mjs:/app/navegador.mjs:ro -v "$R":/resultados sim-navegador node /app/navegador.mjs >/dev/null ;;
  k6)
    script=$2 nombre=$3; shift 3
    docker run -d --rm --name "sim-k6-$nombre" --env-file ./sim.env -e REGION=$REGION \
      -v /opt/sim:/sim:ro -v "$R":/resultados grafana/k6:0.54.0 run -q "$@" -e SALIDA=/resultados/${nombre}__${REGION}.json /sim/$script >/dev/null ;;
  cpu)
    ( while [ -n "$(docker ps -q --filter name=sim-nav- --filter name=sim-k6-)" ]; do
        echo "$(date -u +%s) $(vmstat 4 2 | tail -1 | awk '{print 100-$15}')" >> "$R/cpu_${2}__${REGION}.txt"; done ) >/dev/null 2>&1 & ;;
  esperar)
    while [ -n "$(docker ps -q --filter name=sim-nav- --filter name=sim-k6-)" ]; do sleep 10; done ;;
esac
