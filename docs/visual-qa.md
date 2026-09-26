# Repaso visual y responsive

26 de septiembre de 2026. Base: `aa566a0` (incluye compras, inventario, OCR y contratos).

## Cambios

La capa `app/styles/finish.css` reúne el acabado compartido: elevación de tarjetas, controles, estados de interacción, paneles, formularios y adaptación móvil. Se carga después del CSS de módulos. No cambia los comandos ni la persistencia.

- Inicio: dos columnas en tablet, una en móvil; resumen compacto; bordes, iconos y elevación consistentes.
- Proyectos: tarjetas que caben a 320 px, controles del cronograma que se ajustan y filtros legibles en filas en móvil.
- Pipeline: fecha en su propia línea dentro de la siguiente acción; responsable y alertas pueden distribuirse en dos filas; los días en etapa no se parten.
- Tablas: scroll horizontal local, columnas legibles y contenedor accesible mediante teclado.
- Formularios: ancho acotado en escritorio, altura limitada al viewport dinámico, rejilla que no crece con nombres largos y selectores con elipsis. Corregido el desbordamiento horizontal del presupuesto a 320 px.
- Cabecera: nombre del equipo con elipsis y texto completo accesible al pasar el ratón.
- Paneles y bot: límites de altura, zonas seguras, títulos largos y botones que se adaptan al ancho.
- Dispositivos táctiles: áreas de interacción mayores y texto de campos a 16 px; movimiento reducido respetado.
- Corrección de texto: «Nuevo gasto».

## Comprobaciones

- 14 vistas a 320, 768 y 1440 px: Inicio, Hoy/Foco, Agenda, Pipeline, Proyectos, Leads, Empresas, Catálogo, Contratos, Ventas, Facturas, Gastos, OCR e Informes. En las 42 comprobaciones, el documento mantuvo el ancho del viewport.
- Formularios de lead, empresa, oportunidad, proyecto, catálogo, contrato, presupuesto, factura y gasto a 320 px. El presupuesto inicialmente desbordaba: corregido y vuelto a comprobar (286 px de ancho interior y 286 px de contenido). También revisado el formulario de tarea y el de oportunidad en escritorio.
- Revisión con capturas de Inicio, tarjetas y detalle de proyecto, Pipeline y formularios. Los filtros de proyecto ya no colapsan a una sola letra.
- No se guardaron formularios, enviaron mensajes, facturaron documentos ni alteraron registros durante este repaso.
- `node --import tsx --test tests/*.test.ts`: 57 pruebas correctas. El cargador `tsx` es necesario para la prueba que importa el componente del bot.
- TypeScript y build de producción correctos. El build avisa de un bundle superior a 500 kB; conviene separar la carga por módulos en otra entrega.

## Alcance pendiente

La revisión responsive utiliza el navegador de escritorio con distintos tamaños. Queda la comprobación en hardware táctil real, especialmente teclado virtual y arrastre prolongado. No se certifica en esta entrega el funcionamiento de integraciones remotas ni todos los estados posibles de cada formulario.
