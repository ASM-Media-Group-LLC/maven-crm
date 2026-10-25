-- El almuerzo por defecto es 30 min, no 60 (Alvaro, 20/10). Algunos empleados
-- tendrán 60 (una hora) como excepción por persona, cuando se defina la lista.
update public.cowork_break_limits set minutos = 30 where kind = 'almuerzo';
