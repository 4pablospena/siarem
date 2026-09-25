# Evolución de datos

## Estado de la fase 1

No se ha modificado el esquema persistido ni reiniciado la base de desarrollo. Los cambios de la fase 1 son compatibles con los documentos actuales. La normalización de tareas antiguas se prueba sin mutar la entrada y conserva tareas terminadas y fechas ausentes.

Las tareas nuevas ya no reciben fechas inventadas. Vacío significa que no se ha planificado. Si existe solo inicio u objetivo, el roadmap lo sitúa en esa fecha y explica cuál falta.

## Migración prevista para responsables

Añadir un identificador de miembro, separado del nombre mostrado. No vincular registros existentes solo porque coincida el nombre: puede haber homónimos. Conservar el texto antiguo y mostrarlo como responsable pendiente de vincular. El selector solo ofrecerá miembros del equipo autorizado; el servidor comprobará esa pertenencia al guardar.

No eliminar asignaciones históricas cuando un miembro abandone el equipo. Su identificador y nombre histórico deben seguir siendo legibles, aunque ya no se pueda seleccionar para tareas nuevas.

## Migración prevista para importes desconocidos

Un importe no informado será distinto de cero. Los ceros históricos se conservarán como tales, ya que no se puede inferir su intención. En la conversión de leads, pedir o dejar sin determinar el importe, en lugar de asumir cero. Los totales deberán indicar cuántas oportunidades carecen de estimación.

## Procedimiento antes de cambiar el esquema

1. Crear una copia SQLite consistente usando la API de backup o detener escrituras antes de copiar; nunca copiar solo el archivo principal de una base activa con WAL.
2. Probar restauración en una base temporal.
3. Introducir versión de documento en el almacenamiento, fuera de las colecciones de entidades, para no romper código que recorre `Object.values(state)`.
4. Ejecutar migraciones puras, ordenadas e idempotentes, que rechacen versiones futuras desconocidas.
5. Mantener el guardado condicional por revisión; una migración nunca debe pisar cambios concurrentes.
6. Probar datos antiguos, referencias, campos opcionales y exportación antes de guardar en la base de desarrollo.

Estas migraciones están diseñadas, no ejecutadas. La fase 1 no necesita un cambio de esquema.
