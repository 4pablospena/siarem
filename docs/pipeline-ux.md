# Pipeline: estado y continuación

Actualizado el 26 de septiembre de 2026.

## Implementado

- Tablero a todo el ancho con fondo hundido, columnas diferenciadas y tarjetas elevadas. Cinco etapas visibles a 1440 px; desplazamiento horizontal en pantallas pequeñas, sin ensanchar la página.
- Botones compartidos con estados de hover, pulsación, foco y movimiento reducido. Tarjetas abiertas desde el título o el cuerpo; los controles interiores mantienen su propia acción.
- `app/board.tsx` separa tablero, columnas y tarjetas del cliente principal. Proyectos conserva la misma base y sus acciones de asignación y horas.
- Arrastre con `@dnd-kit/core`: activación a partir de 6 px, tarjeta flotante, columna de destino resaltada, desplazamiento automático configurado, Escape para cancelar y teclado (Espacio, flechas horizontales, Espacio).
- Menú Mover accesible con Radix, fuera del contenedor que hace scroll. El foco sigue al registro al terminar el guardado.
- Crear una oportunidad desde una columna preselecciona etapa y empresa filtrada.
- La tarjeta prioriza nombre de oportunidad, empresa, importe y siguiente acción. Las tareas pendientes tienen precedencia sobre el siguiente paso general. Ganadas y perdidas no muestran instrucciones de seguimiento antiguas.
- El cambio de etapa conserva revisión y etapa esperada. Si falla, revierte la actualización visual antes de recargar. Un segundo movimiento no se aplica mientras hay un guardado en curso.

## Validación

- TypeScript sin errores; build de producción correcto; ESLint de los archivos nuevos correcto.
- 23 pruebas de dominio, exportación, proyectos, siguiente acción, borrador de seguimiento y resumen de Hermes.
- Comprobado en navegador: ratón entre etapas, teclado, cancelación con Escape, soltar fuera, soltar en la misma etapa, menú Mover, foco tras guardar, creación con etapa, búsqueda sin resultados y borrado de filtro.
- Conflicto de revisión observado durante la prueba: se rechazó el cambio y se recuperó la etapa del servidor.
- Revisión visual a 1440, 768 y 390 px; en móvil la página mantiene su ancho y solo el tablero desplaza horizontalmente.
- Los registros utilizados para probar movimientos volvieron a su etapa inicial. No se crearon registros ni se borraron datos.

## Límites y siguientes comprobaciones

El arrastre cambia de etapa; no reordena posiciones dentro de una etapa. No se añadió un campo de orden persistente. El desplazamiento automático utiliza el motor de dnd-kit; queda por validar su tacto con un dispositivo táctil físico y un volumen grande de oportunidades. Las pruebas de interacción de esta entrega fueron manuales en navegador, no una suite E2E automatizada.

## Módulo 1 · Ficha de oportunidad y Foco (hecho)

- Una sola fuente para la siguiente acción (`pipelineNextAction`): tarjeta, Foco, CSV, ficha, borrador de seguimiento (`followupDraft`) y el resumen que recibe Hermes. «Marcar hecha» completa exactamente la tarea que se muestra.
- La ficha se ordena en tres bloques: **Seguimiento** (solo abiertas: motivo de riesgo, siguiente acción, «Después»), **Cierre** (etapa, cierre previsto con aviso si venció, presupuesto, marcar ganada/perdida) y **Actividad** (contactos y seguimientos completados). Estado e importe van una sola vez, en la cabecera.
- Cerrar desde la ficha usa el mismo cambio de etapa del tablero, con deshacer, y lleva el foco al bloque Cierre. Una oportunidad cerrada no ofrece seguimientos ni presupuesto; conserva sus tareas en Actividad y enlaza a su proyecto si existe.
- Sin oportunidad seleccionada, la ficha de empresa lista sus oportunidades para abrirlas.
- Hermes recibe «Piden atención» con la misma lista y orden que Foco, sin oportunidades cerradas.
- Validado: 23 pruebas; navegador a 1440 px con orden de tabulación seguimiento → cierre → actividad, cierre como ganada y deshacer (la oportunidad volvió a Negociación).

## Módulo 2 · Leads y Empresas (hecho)

- Convertir un lead reutiliza la empresa existente si coincide el nombre o el email (sin distinguir mayúsculas ni acentos, y sin mezclar demostración con datos propios). Solo rellena campos vacíos de la empresa; nunca sobrescribe. El aviso indica cuándo no se ha duplicado.
- Empresas abre la ficha de empresa (oportunidades y actividad), no la primera oportunidad. La columna «Último contacto» sustituye al ajuste «Alerta a los N días» y se marca en ámbar al superar el aviso o si no hay contactos. «Falta email y teléfono» señala datos incompletos.
- Leads: fechas cortas con «Vencida», notas limitadas a dos líneas (completas en la ficha y en la nota creada al convertir) y sin fecha de acción en convertidos o descartados.
- Validado: 24 pruebas, incluida la conversión sin duplicados; revisión en navegador sin convertir ni modificar datos.
- Pendiente de decisión del usuario: en los datos actuales ya existen «Pablo» y «Resizes Platform» con el mismo email. No se han fusionado; hacerlo requiere elegir cuál conservar.

## Próximos módulos, en orden

1. ~~**Ficha de oportunidad y Foco.**~~ Hecho; ver arriba.
2. ~~**Leads y Empresas.**~~ Hecho; ver arriba. Mejorar cualificación y conversión, datos de contacto incompletos y navegación al historial. Mantener la trazabilidad y evitar duplicados.
3. **Proyectos.** Pulir ficha de tarea, responsables, fechas y cambio entre tablero y roadmap. Probar proyectos con muchas tareas y sin fechas antes de ampliar funcionalidades.
4. **Ventas y Facturas.** Revisar jerarquía de tablas y formularios, validaciones y estados de confirmación/cobro. Conservar los controles de facturación ya probados.
5. **Hermes.** Concretar el endpoint y contrato de la instalación desplegada. Definir las acciones automáticas autorizadas, permisos, idempotencia y trazabilidad sobre los comandos existentes. No dar por conectada la instalación remota hasta validar una llamada real. Las claves no se muestran nunca: ni en el chat, ni en errores, ni en la interfaz. El campo es una contraseña, sin botón para revelarla.

Antes de iniciar otro módulo: revisar cambios locales del usuario, preservar datos y comprobar el recorrido completo del módulo anterior. No hacer una sustitución global de estilos ni añadir indicadores sin una decisión concreta que soporten.
