#!/bin/zsh
# Guarda la llave de la API de Vultr en ~/.config/maven/vultr.env (solo tú la lees).
# La llave no se muestra en pantalla ni queda en el historial.
print -n "Pega la llave de Vultr (Cmd+V) y dale Enter: "
read -rs K
print
if [[ -z "$K" ]]; then print "No pegaste nada. Vuelve a correrlo."; exit 1; fi
mkdir -p ~/.config/maven
printf 'VULTR_API_KEY=%s\n' "$K" > ~/.config/maven/vultr.env
chmod 600 ~/.config/maven/vultr.env
unset K
print "listo ✅  Ya puedes cerrar esta pestaña."
