# El servidor de descargas de grabaciones, con su código ADENTRO de la imagen.
#
# Antes entraba por bind-mount de un solo archivo y eso escondía una trampa
# cara: `compose up -d` no ve ningún cambio en la definición del servicio, así
# que no recrea ni reinicia el contenedor. Node ya tenía el módulo cargado en
# memoria, o sea que seguía sirviendo el código viejo mientras el deploy
# figuraba "Done" en verde. Perdí una hora depurando código que no estaba
# corriendo.
#
# Con el código en la imagen, tocar rec-server.mjs cambia la imagen, y eso SÍ
# hace que compose recree el contenedor. El deploy vuelve a significar lo que
# uno cree que significa.
FROM node:22-alpine
WORKDIR /app
COPY rec-server.mjs /app/rec-server.mjs
# El chmod NO es decorativo: Docker crea /var/lib/maven/grabaciones como
# root:755 y el egress corre sin privilegios, así que la grabación se componía
# bien y moría al ESCRIBIR con "permission denied" (21/08). rec-server es root
# y deja el directorio escribible al bootear.
CMD ["sh", "-c", "chmod 1777 /out && exec node /app/rec-server.mjs"]
