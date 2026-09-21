# Siarem

CRM interno en español y euros. Seis pantallas: Foco, Pipeline, Empresas, Ventas, Proyectos y Facturas.

El catálogo se ha omitido por decisión del usuario. Los presupuestos tienen líneas de servicio manuales, cada una con política de facturación y tareas para crear su proyecto. No incluye inventario, nómina, campañas ni contabilidad general.

## Uso

1. Inicia sesión y crea el espacio de tu empresa, o acepta un código de invitación desde la pantalla inicial.
2. Crea empresas y oportunidades. El umbral sin contacto se configura en cada empresa (30 días por defecto, hasta 90). El aviso de cierre se activa con 7 días de antelación.
3. Abre la ficha lateral para registrar contactos, crear o completar seguimientos y preparar un texto de seguimiento. Copiar o abrir el correo no envía el mensaje automáticamente.
4. Crea un presupuesto desde la oportunidad. Introduce los servicios y sus tareas de entrega. Puedes guardar un pedido borrador o confirmarlo directamente.
5. Al confirmar, se crea un proyecto con las tareas de cada servicio y la oportunidad pasa a Won & Ongoing.
6. Imputa horas y su coste interno a las tareas. El margen es el importe del pedido menos el coste de todas las horas del proyecto.
7. Genera facturas del pedido: saldo pendiente para precio fijo, importe parcial para hitos, o las horas seleccionadas al precio de venta por hora. Se impide facturar dos veces las mismas horas y superar el saldo de fijo/hitos.
8. Registra un cobro completo para marcar la factura como cobrada.

Las líneas de pedidos confirmados quedan bloqueadas; su nombre se puede editar y se refleja en el proyecto. Los presupuestos con pedido también quedan bloqueados. Las facturas permiten editar la referencia y las fechas. Para corregir sus importes, elimina la factura y vuelve a generarla. Eliminar una factura elimina su cobro asociado y libera las horas o el importe para volver a facturar. Los demás registros con dependencias requieren eliminar primero los registros vinculados.

Los importes representan la base del servicio sin impuestos. Esta versión no calcula IVA ni produce documentos fiscales oficiales.

## Desarrollo local

Requiere Node.js 22.13 o posterior y npm. Los tests TypeScript se han ejecutado con Node.js 25.9.

```sh
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_gorgeous_sharon_carter.sql
npm run dev
```

Aplica la migración inicial una sola vez a cada base de datos nueva. La vista previa se sirve en la dirección indicada por el servidor (normalmente http://localhost:5173).

El inicio de sesión local utiliza la identidad de prueba `Seedy`, proporcionada por el adaptador local del starter. No contiene credenciales reales y no forma parte de la compilación de producción. La base SQLite local persiste en `.wrangler/state`; borrarla elimina los datos de la vista previa. No se guarda información comercial en localStorage.

## Autenticación, equipos y almacenamiento

En producción, el dispatcher de Sites realiza el inicio de sesión con ChatGPT e inyecta la identidad autenticada. `/api/crm` y `/api/export` rechazan peticiones sin identidad. La empresa autorizada se obtiene de `members` en el servidor, nunca de un tenant ID enviado por el navegador. Es imprescindible conservar este límite de confianza: un Worker expuesto directamente sin el dispatcher necesitaría su propia verificación de identidad, no cabeceras arbitrarias del cliente.

Cada identidad pertenece a un equipo. El propietario crea invitaciones de un solo uso, válidas durante 24 horas. Aceptarlas concede acceso compartido a ese equipo. Otro usuario puede crear un equipo independiente con sus propios datos.

D1 almacena metadatos de equipos, miembros, invitaciones y un documento JSON de registros por equipo. Las escrituras usan revisión optimista y actualización condicional atómica; si otro compañero guarda antes, se devuelve 409 y el formulario se conserva para recargar y reintentar. Este diseño carga el conjunto del equipo; antes de volúmenes elevados conviene separar los registros en filas y añadir paginación en servidor.

`db/schema.ts` define las tablas y `drizzle/` contiene la migración. Las consultas están parametrizadas. Las relaciones se validan dentro del estado autorizado. Los CSV aplican los filtros de la pantalla y neutralizan celdas que podrían interpretarse como fórmulas.

## Verificación

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/domain.test.ts tests/export.test.ts
npm run build
npm start -- --port 5174
# En otra terminal:
node --test tests/server.test.mjs
```

El test de servidor solo admite direcciones loopback. Simula las cabeceras del dispatcher y crea equipos de prueba independientes. Comprueba anonimato, aislamiento entre empresas, invitaciones, permisos, escrituras concurrentes, persistencia y exportación autenticada. Reinicia el servidor de producción local después de recompilar para que cargue las rutas nuevas.

Consulta `QA.md` para el recorrido manual comprobado.

## Publicación

Pendiente de aprobación de la vista previa. `.openai/hosting.json` declara D1 (`DB`) y el Worker se genera en `dist/server`. No hay despliegue público ni identidad de Site registrada todavía. La publicación debe mantener el acceso con inicio de sesión y comprobar el dispatcher real y la política de acceso antes de entregar la URL de producción. Los datos de la vista previa no se suben automáticamente: cada equipo nuevo se inicia con la demostración Prueba Peña, eliminable desde la interfaz.
