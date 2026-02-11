

# Ajustar dropdown "Asignar a" en CreateTicketModal

## Cambio

Reemplazar el campo `Input` actual de "Asignar a" por un `Select` dropdown con las siguientes opciones extraidas de las imagenes:

| Value | Label |
|-------|-------|
| (vacio) | Sin asignar |
| alvaro | alvaro (@alvaro) |
| amartinez | Ana Martinez (@amartinez) |
| Andres.Gaviria | Andres Gaviria (@Andres.Gaviria) |
| Brayan123 | Brayan Esneider Castano Hoyos (@Brayan123) |
| carolina.jaramillo@unlok.me | Carolina Jaramillo (@carolina.jaramillo@unlok.me) |
| cheryl.gonzalez@unlok.me | Cheryl Gonzalez (@cheryl.gonzalez@unlok.me) |
| clopez | Carlos Lopez (@clopez) |
| cruiz | Carmen Ruiz (@cruiz) |
| Fabiana_Duran | Fabiana Duran (@Fabiana_Duran) |
| gislaineescudero | Gislaine Escudero (@gislaineescudero) |
| gracegelves260 | Grace Gelves (@gracegelves260) |
| Isatuiran | Isabel Tuiran (@Isatuiran) |
| jmoreno | Javier Moreno (@jmoreno) |
| Johanna | Johanna Riano (@Johanna) |
| jorge | Jorge Restrepo (@jorge) |
| jorge.restrepo | Jorge Restrepo 3 (@jorge.restrepo) |
| jorge.restrepo.1 | jorge.restrepo.1 (@jorge.restrepo.1) |
| lizeth.jerez@unlok.me | Lizeth Jerez (@lizeth.jerez@unlok.me) |
| lorena_lozano | Lorena Lozano (@lorena_lozano) |
| lrodriguez | Luis Rodriguez (@lrodriguez) |
| Luisroman07 | Luis Carlos Ortega Roman (@Luisroman07) |
| marielby | Marielby Quijada (@marielby) |
| maritest | Marielby Testing (@maritest) |
| mgarcia | Maria Garcia (@mgarcia) |
| michel_zarate | Michel Zarate (@michel_zarate) |
| mitchtest | Mitch Test (@mitchtest) |
| monica.duque@unlok.me | Monica Duque (@monica.duque@unlok.me) |
| Paularomero | Paula Romero (@Paularomero) |
| Pepe Glaves | Grace Galvez Galvez (@Pepe Glaves) |
| pepeel | peo peo (@pepeel) |
| perez | Fernado Perez (@perez) |
| ptorres | Pablo Torres (@ptorres) |
| ruben.guzman | Ruben Guzman (@ruben.guzman) |
| rusin24 | rusin24 (@rusin24) |
| sfernandez | Sofia Fernandez (@sfernandez) |

## Seccion tecnica

- **Archivo**: `src/pages/creadores/CreateTicketModal.tsx`
- Reemplazar el `Input` de "Asignar a" por un componente `Select` con placeholder "Sin asignar"
- El estado `assignedTo` sigue siendo string; valor vacio = sin asignar
- Ordenado alfabeticamente por nombre
- El valor guardado en BD sera el handle/username (ej: "alvaro", "amartinez")

