# Verificación de Siarem · 21 de septiembre de 2026

## Recorrido en navegador

Comprobado desde la interfaz de la vista previa local:

- Inicio de sesión local y creación del espacio de trabajo.
- Creación de la empresa «Validación Siarem» y validación de un email incorrecto. El nombre y contacto escritos se conservaron al corregir el error.
- Creación de la oportunidad «Servicio de validación», con importe de 1.000 €.
- Cambio de Lead Discovery a Meeting Scheduled y deshacer hasta Lead Discovery. Totales del pipeline actualizados.
- Registro de una interacción, creación de un seguimiento y marcado como completado. La tarea permanece visible tras recargar.
- Creación del presupuesto con servicio manual de 1.000 €, confirmación del pedido y creación automática del proyecto con tres tareas.
- Imputación de una hora a Preparación, con coste de 35 €. Margen verificado: 965 €.
- Generación de factura de 1.000 € y registro del cobro. La factura aparece cobrada.
- Recarga: empresa, documentos, tarea completada, hora, cobro y margen conservados.
- Edición de fecha de siguiente paso: 20/09/2026, con riesgo crítico y motivo visible. Se ajustó el control de fecha para recoger el evento de entrada de WebKit.
- Preparación y copia del texto de seguimiento con el nombre de la oportunidad.
- Búsqueda que reduce la lista al cliente de prueba y estado «Sin resultados» con una consulta inexistente.
- Navegación en 390 px de ancho, menú móvil accesible y cierre al seleccionar pantalla. La página no desborda horizontalmente; las tablas secundarias tienen desplazamiento propio. Foco presenta los datos apilados.
- WebMCP: navegación válida a Foco; una pantalla inexistente se rechaza.

## Pruebas automatizadas

11 pruebas de dominio/CSV y una prueba de integración de servidor con varias identidades, además de TypeScript y compilación:

- Facturación a precio fijo, por horas al precio de venta y por hitos.
- Prevención de doble facturación, cobro duplicado y exceso sobre el saldo pendiente.
- Margen basado en las horas; fechas y relaciones válidas; deshacer con comprobación de etapa previa.
- Umbrales de riesgo, seguimientos completados y exclusión del aviso de cierre para oportunidades ganadas.
- Eliminación de demostración conservando datos propios y protección de dependencias.
- CSV filtrado, celdas escapadas y neutralización de fórmulas.
- Peticiones anónimas rechazadas; lectura/escritura entre empresas bloqueada; colaboradores del mismo equipo comparten registros.
- Invitación de un solo uso y restricción de invitaciones al propietario.
- Dos escrituras simultáneas: una se guarda y la otra recibe conflicto sin sobrescribir.
- Exportación CSV autenticada con cabecera de descarga y consulta aplicada.

## Límites de lo comprobado

La identidad local es simulada por el adaptador de desarrollo. La autenticación y los recursos de producción se verificarán después de aprobar y publicar. El evento de descarga del navegador integrado no quedó disponible para automatización; el endpoint de descarga, su contenido filtrado y sus cabeceras se comprobaron mediante HTTP.
