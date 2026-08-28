-- CORRECCION de lo que afirmaba la migracion anterior.
--
-- Dije que BLU "pierde la atribucion por empleado a las ~2 semanas". Es FALSO.
-- La forma de los datos (05/08 y 10/08 sin nadie, 14/08 dos personas, 17/08
-- cuatro, 27/08 trece) no es un dato que se borra: es la migracion desde
-- Infloww en curso. BLU es software propio de la empresa y el equipo recien se
-- esta mudando.
--
-- La prueba esta en nuestro propio archivo: chatter_daily_sales se capturo dia
-- por dia cuando cada dia estaba fresco, y coincide EXACTO con lo que BLU
-- devuelve hoy para esos mismos dias (14/08: 2 filas y $173 en Maven contra 2
-- chatters y $173,25 en BLU; 17/08: 4 y $1.480 contra 4 y $1.479,80). BLU
-- devuelve hoy lo mismo que devolvia entonces. Los huecos siempre fueron
-- huecos.
--
-- QUE CAMBIA. El calculo no: promediar solo sobre dias CON registro sigue
-- siendo lo correcto, y es lo que evita que los dias vacios deflacten la vara.
-- Lo que cambia es la LECTURA: la vara de hoy sale de un puñado de personas ya
-- migradas y se va a mover mucho cuando entren las demas. Estas notas no
-- sirven todavia para evaluar a nadie.

COMMENT ON FUNCTION public.chatter_model_baseline(bigint, date, integer) IS
  'Vara de UN chatter en UNA modelo por dia: promedio, sobre los dias CON REGISTRO, del total de la modelo repartido entre los chatters que la atendieron. OJO: mientras dure la migracion desde Infloww esta vara sale de pocos dias y pocas personas — es provisional, no sirve para evaluar.';

COMMENT ON FUNCTION public.chatter_model_backfill_tick(integer, integer, integer) IS
  'Trae un pedazo del historico chatter-modelo desde BLU. Idempotente: se guia por chatter_model_daily_sync, asi que se puede cortar y retomar. La captura diaria es higiene, no urgencia: BLU no borra el detalle (ver correccion_no_es_caducidad_es_migracion).';

COMMENT ON TABLE public.chatter_daily_score IS
  'Nota diaria 1-10 por chatter. Se guarda con el snapshot de la config usada: cambiar los pesos no reescribe el pasado. PROVISIONAL mientras dure la migracion desde Infloww: la vara se calcula sobre los pocos chatters ya migrados.';
