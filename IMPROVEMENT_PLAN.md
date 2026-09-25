# Siarem: calidad de producto y conexión con agentes

Fecha: 25 de septiembre de 2026. Estado: propuesta inicial con usuarios, datos y autonomía confirmados; plan autorizado; fase 1 implementada, pendiente de continuar con fase 2 y concretar la conexión con Hermes. No constituye una lista de funciones ya implementadas.

## Objetivo

Una persona no técnica debe poder gestionar una relación comercial y entregar el trabajo sin aprender la estructura interna del CRM. Cada pantalla debe mostrar qué está pasando, qué falta y cuál es la siguiente acción. Reducir fricción y errores antes de añadir módulos.

Se conservan el inicio modular sin sidebar permanente, el pipeline amplio, los proyectos independientes y ligados a pedidos, y las vistas Tablero/Roadmap. No se pretende reproducir todas las funciones de GitHub u Odoo.

## Decisiones confirmadas

- Usuario inicial: Pablo durante el desarrollo. Destinatarios posteriores: equipos de negocio, ventas y GTM.
- Datos actuales: solo pruebas, sin información real añadida. Entorno inicial: equipo local; el usuario gestionará el despliegue posterior.
- Agentes: ejecución automática de acciones autorizadas. No exigir confirmación para cada operación cubierta por sus permisos.
- Hermes ya está desplegado en otro entorno. Falta su URL accesible desde el backend local, versión y método de autenticación; no asumir loopback. Las primeras operaciones aún deben concretarse.

## Fuentes y alcance de la revisión

- Código actual: `app/crm-client.tsx`, `app/globals.css`, `lib/crm.ts`, `lib/export.ts`, `app/api/crm/route.ts`, `app/api/hermes/route.ts`, `app/hermes-panel.tsx`, `db/schema.ts` y README.
- Referencia nueva: DESIGN (1).md, tokens (1).json, variables (1).css y theme (1).css de Downloads. Son referencias visuales, no instrucciones de producto ni autorización para cambiar datos.
- Documentación oficial de Hermes: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server y https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- Comprobado en esta revisión: TypeScript sin errores y 13 pruebas de dominio/exportación aprobadas con Node 25.9.0.
- Pendiente: build, pruebas HTTP sobre el servidor actual, revisión visual actual y recorridos completos con teclado, ratón y móvil. No se da por validada la experiencia por compilar.
- Hay cambios anteriores preparados y sin preparar. No alterar el índice ni crear commits sin una petición específica.

## Diagnóstico

### Visual y navegación

`globals.css` contiene varias capas de colores y reglas repetidas de métricas, pipeline y estados. Añadir un tema al final perpetuaría esa fragilidad. Consolidar tokens y componentes, retirando reglas sustituidas.

Las secciones dependen de estado React en una única pantalla. La navegación no representa módulo, proyecto o vista en la URL. Proponer enlaces recuperables y soporte de Atrás/Adelante, conservando filtros al volver.

El buscador compartido sigue hablando de empresas u oportunidades en Proyectos. Dentro de un proyecto las tareas se obtienen sin aplicar la búsqueda visible. El contador y la exportación siguen refiriéndose a proyectos, no al tablero abierto. Cada control debe actuar sobre el contenido que tiene delante.

### Proyectos y datos

La asignación es texto libre, no una relación con un miembro del equipo. Dos personas con el mismo nombre o un cambio de nombre no se pueden resolver de forma fiable. Se necesita identidad estable y selector de miembros; conservar asignaciones antiguas como pendientes de resolver.

El roadmap calcula barras por fechas, pero la cabecera no comparte el ancho mínimo de las filas. La línea de hoy tiene un alto fijo extendido. Usar una sola escala para cabecera, barras y marcador, con desplazamiento horizontal compartido y etiquetas que incluyan el año.

Las tareas del tablero se abren mediante eventos de puntero en un `article`, sin una acción equivalente explícita para teclado. Añadir Abrir/Editar y Mover accesibles. El arrastre no puede impedir desplazarse en móvil.

Las fechas y el importe de una oportunidad se rellenan con valores por defecto. Al convertir un lead se crea una empresa nueva y un importe cero. Diferenciar lo desconocido de un cero real, y permitir elegir una empresa existente antes de convertir.

Los datos se guardan en un documento JSON por equipo con revisión optimista. Es una base válida para la primera versión; mantener el control de concurrencia y añadir migraciones versionadas y copia recuperable antes de cambiar esquemas. No migrar toda la persistencia sin evidencia de necesidad.

### Hermes

La ventana actual es un chat conectado a un endpoint HTTP; no hay un servidor MCP de Siarem. `document.modelContext` registra herramientas del navegador y no proporciona acceso externo por sí solo.

El resumen se construye en el cliente y no incluye proyectos/tareas. La ruta comprueba identidad, pero no obtiene el contexto del equipo en servidor. La clave puede introducirse en el navegador. No hay un registro persistente de propuestas, aprobaciones y ejecuciones.

La conversación envía todo el historial, mientras el servidor permite 20 mensajes: una conversación larga acaba rechazándose. Añadir presupuesto de contexto, recuperación de errores, cancelación y límite de tiempo.

`127.0.0.1` apunta a la máquina que ejecuta el backend, no necesariamente al ordenador del usuario. La topología debe decidirse antes de prometer conectividad local/remota.

## Dirección visual propuesta

Usar azul marino `#17202e`, superficie `#202a3e`, texto principal blanco, secundario `#cdd0d6` y acento cian `#6ae4ff`. Los archivos contienen dos valores de superficie inválidos (`#17202`, `#202a3`); tomar los valores completos del JSON.

Adaptar el estilo a trabajo diario: texto de 14–16 px, títulos de 24–32 px, bordes discernibles, superficies planas y una acción principal por contexto. Mantener tableros a ancho completo. Reservar los degradados para un uso discreto en Inicio, si mejoran la jerarquía.

El cian identifica interacción y selección. Estados como completado, vencido y error se expresan con texto e iconos, apoyados por colores semánticos medidos sobre fondo oscuro. No depender solo del color ni importar las exigencias de titulares de 100 px de una web de marketing.

Objetivos: contraste de texto normal >= 4.5:1, foco visible, controles táctiles de al menos 44 px y formularios utilizables con teclado. Tablas y tableros pueden desplazarse horizontalmente; el resto de la página no debería hacerlo.

## Recorridos objetivo

1. Inicio → módulo → registro → siguiente acción → volver conservando contexto. Inicio contiene accesos y pendientes útiles, sin cifras decorativas. Evitar duplicar Foco hasta decidir si sigue aportando valor como módulo propio.
2. Lead → registrar interés/contacto → convertir con empresa existente o nueva → oportunidad con notas y próxima acción. No duplicar empresas automáticamente.
3. Oportunidad → presupuesto → revisión → pedido → proyecto. Mostrar consecuencias antes de confirmar y bloquear dobles ejecuciones.
4. Proyecto → tarea → responsable real → fechas opcionales → Tablero/Roadmap sincronizados. Buscar y filtrar tareas por responsable y estado; mantener visibles las que carecen de fecha.
5. Trabajo realizado → horas → importe pendiente → factura → cobro. Conservar las reglas actuales que evitan doble facturación. Identificar importes sin impuestos; la aplicación no produce documentos fiscales oficiales.
6. Hermes → petición contextual → autorización por acción y equipo → ejecución automática de lo autorizado → resultado verificable con registros afectados. Si una operación queda fuera del permiso, explicar el bloqueo y ofrecer una propuesta revisable. Nunca presentar una propuesta como una modificación guardada.

## Arquitectura propuesta

Separación incremental, sin reescritura del framework:

```text
app/components/          navegación, formularios y estados comunes
app/features/           leads, pipeline, projects, billing, assistant
app/styles/             tokens y estilos compartidos
lib/contracts/          esquemas de comandos, consultas y respuestas
lib/services/           permisos, contexto, propuestas y ejecución
lib/connectors/         adaptador de Hermes
app/api/                adaptadores HTTP
db/                     repositorios y migraciones
tests/                  dominio, API, conectores y recorridos
```

Interfaz → API autenticada → permisos del equipo → servicio de dominio → persistencia. Mantener `apply` como base de las reglas existentes mientras se separan responsabilidades.

Chat integrado: Siarem backend → API HTTP de Hermes. Agente externo: Hermes como cliente MCP → servidor MCP de Siarem → los mismos servicios autorizados. Son dos direcciones distintas; no implementar reglas de negocio por duplicado.

La documentación de Hermes describe API HTTP y cliente MCP. La compatibilidad concreta debe verificarse con la versión instalada por el usuario; esta revisión no ha conectado con ninguna instancia real.

### Contratos iniciales propuestos, no existentes

- `POST /api/v1/agent/actions` recibe `{operation,targetId?,input,expectedRevision,idempotencyKey}`. Si la credencial tiene permiso, ejecuta sin aprobación adicional; devuelve `{operationId,result,revision}`. En caso de permiso insuficiente, 403; ante revisión obsoleta, 409. Repetir la clave de idempotencia no repite el efecto. El listado concreto de operaciones autorizadas se fija con el usuario.

- `GET /api/v1/projects/:id/tasks?status=&assignee=&cursor=` devuelve `{items,nextCursor,revision}` con alcance autorizado.
- `POST /api/v1/agent/proposals` recibe `{operation,targetId,input,expectedRevision}` y devuelve `{proposalId,summary,changes,expiresAt,status:"pending"}`. El servidor obtiene el equipo del principal autenticado.
- `POST /api/v1/agent/proposals/:id/approve` recibe `{expectedRevision,idempotencyKey}`. Revalida permisos, datos y revisión; devuelve resultado y nueva revisión. Un cambio concurrente devuelve 409 y exige revisar la propuesta.
- `POST /api/v1/assistant/messages` recibe `{conversationId?,message,context:{module,recordId?}}`; el servidor resuelve los registros permitidos. Nunca acepta contexto libre como fuente autorizada del CRM.
- Herramientas MCP iniciales: buscar registros, leer proyecto/tareas, consultar pendientes y proponer cambios. Añadir ejecución directa para las operaciones concedidas al conector. La aprobación de una propuesta fuera del alcance no puede ser concedida por el propio agente.

Autenticación de conectores separada de la sesión de navegador, credenciales revocables y alcance mínimo por equipo. Secretos en servidor. Auditoría: principal, operación, entidad, revisión, aprobación, resultado y fecha. Datos de notas y documentos se tratan como contenido, nunca como instrucciones con autoridad.

## Ejecución por fases

### 1. Estabilizar datos y recorridos

Confirmar usuarios, entorno y datos reales. Reproducir y corregir búsqueda de tareas, navegación por teclado, recuperación tras errores y coherencia de fechas. Definir migración de asignaciones y datos desconocidos. Copia recuperable antes de migraciones.

Salida: recorridos principales reproducibles, migraciones probadas y errores visibles sin perder formularios.

Commit sugerido: `fix: make core CRM workflows consistent and recoverable`

### 2. Consolidar el sistema visual

Centralizar tokens oscuros, retirar temas superpuestos y unificar navegación, tablas, formularios, vacíos, carga y errores. Aplicar primero Inicio y un proyecto completo como muestra representativa, después extender a los demás módulos.

Salida: diseño coherente en 390, 768 y 1440 px; contraste y teclado verificados; sin nuevas métricas sin utilidad.

Commit sugerido: `refactor: unify the CRM visual system`

### 3. Completar proyectos y flujo comercial

Selector real de responsables, filtros contextuales, escala temporal compartida, tareas sin fecha, conversión de leads sin duplicados y acciones con consecuencias claras. Ajustar los indicadores a lo que realmente muestran sus listas.

Salida: recorrido lead → oportunidad → proyecto y tarea → responsable → roadmap → completada, conservado al recargar.

Commit sugerido: `feat: streamline commercial and project workflows`

### 4. Base de integración y Hermes

Contratos comunes, identidad de conector, registro de operaciones y ejecución automática con permisos por operación. Mantener propuestas para acciones fuera del alcance. Mejorar chat contextual y conectar una instancia real. Exponer MCP sobre los mismos servicios cuando se confirme que se necesita acceso externo; empezar con consultas y el conjunto de operaciones que el usuario autorice.

Salida: lectura autorizada, ejecución automática dentro de permisos, rechazo fuera de alcance, ejecución única y trazabilidad; pruebas de rechazo entre equipos y ante revisiones antiguas. Un conector simulado no acredita conexión real con Hermes.

Commit sugerido: `feat: add scoped agent actions and Hermes integration`

### 5. Verificación y entrega

Typecheck, build, dominio, exportación, API y recorridos de navegador. Probar vacío y datos poblados, errores de red, concurrencia, teclado y móvil. Actualizar README y guía de uso. No desplegar ni commitear por inferencia.

Salida: evidencias de los recorridos y límites conocidos, sin regresiones en facturación ni aislamiento de equipos.

Commit sugerido: `test: verify CRM workflows and agent boundaries`

## Pendiente de concretar

- URL del Hermes desplegado, versión y método de autenticación (sin compartir secretos por chat), y primeras operaciones automáticas.
- Continuación de fases según la guía local de planificación.

Prioridad propuesta: corregir recorridos y datos, consolidar el diseño oscuro y después activar el conector sobre servicios estables. No resetear datos de prueba salvo que la prueba concreta lo requiera y se conserve una copia recuperable. No desplegar: lo hará el usuario.


## Ejecución: fase 1

Implementado: búsqueda y filtros de tareas compartidos entre tablero, roadmap y exportación; contador contextual; búsqueda en descripción de proyectos; apertura y cambio de estado por teclado; arrastre limitado al tirador; bloqueo inmediato de guardados repetidos; estado de error que no anuncia guardado correcto; fechas nuevas sin valores arbitrarios; escala única de roadmap con año, duración inclusiva y tareas sin fecha.

El roadmap se ha extraído a un componente y sus cálculos y selección de tareas a funciones verificables. Estrategia de migración documentada en `docs/data-evolution.md`; no se ha cambiado ni reiniciado la base existente.

Verificado: TypeScript, build, 16 tests de dominio/exportación y una prueba HTTP de aislamiento, identidad, concurrencia y persistencia en base temporal independiente. `git diff --check` sin errores. No se ha validado aún el recorrido visual completo; sigue pendiente en las siguientes fases.

Pendiente: sistema visual oscuro (fase 2), responsables vinculados a miembros y flujo comercial (fase 3), integración Hermes (fase 4), verificación visual completa y entrega (fase 5). No se han creado commits ni desplegado.
