#!/bin/bash
# Imita el internet de una ciudad y una condición, y corre el comando.
#   RTT_MS   ida extra (la mitad del ping desde la ciudad)
#   COND     bueno | malo | cortes | sin_internet
set -u
IF=eth0
D=${RTT_MS:-20}
case "${COND:-bueno}" in
  bueno)        tc qdisc add dev $IF root netem delay ${D}ms $((D/10+1))ms ;;
  malo)         tc qdisc add dev $IF root netem delay $((D+80))ms 40ms distribution normal loss 3% rate 1500kbit ;;
  cortes|sin_internet) tc qdisc add dev $IF root netem delay ${D}ms $((D/10+1))ms ;;
esac
if [ "${COND:-}" = "cortes" ]; then
  # se cae 15 s cada 60 s
  ( while true; do sleep 45; tc qdisc change dev $IF root netem delay ${D}ms loss 100%; sleep 15; tc qdisc change dev $IF root netem delay ${D}ms $((D/10+1))ms; done ) &
fi
if [ "${COND:-}" = "sin_internet" ]; then
  # minuto 2 a 3: sin internet; después vuelve (¿se recupera solo?)
  ( sleep 120; tc qdisc change dev $IF root netem loss 100%; sleep 60; tc qdisc change dev $IF root netem delay ${D}ms $((D/10+1))ms ) &
fi
exec "$@"
