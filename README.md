# Siarem

CRM de ventas y entrega, en español y en euros. Un equipo comparte empresas, leads, oportunidades, pedidos, proyectos y facturas.

## Qué hace

Desde **Inicio** se entra a cada módulo:

- **Foco.** Lo que hay que atender.
- **Leads.** Bandeja previa. Un lead se convierte en empresa y oportunidad.
- **Pipeline.** Cualificación, Propuesta, Negociación, Ganada y Perdida. Las oportunidades se arrastran entre columnas.
- **Empresas y Ventas.** Fichas, presupuestos y pedidos.
- **Proyectos.** Tablero (Por hacer, En curso, Hecho), asignación y roadmap por fechas. Confirmar un pedido crea el proyecto y pasa la oportunidad a Ganada.
- **Facturas.** Emisión y cobro. Los importes son la base del servicio, sin impuestos.

**Siarem-bot** es un panel de ayuda. No modifica los registros por su cuenta. Cada vista se puede exportar a CSV.

## Arranque

Hace falta Node.js 22.13 o posterior.

```sh
cd siarem
npm ci
npm run dev
```

La app queda en [http://localhost:5173](http://localhost:5173). En local, entra por `/signin-with-chatgpt?return_to=/`: usa la identidad de prueba Seedy y no vale en producción. Los datos se guardan en `.wrangler/state`.

La primera vez, con la base vacía, aplica la migración:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_gorgeous_sharon_carter.sql
```

## Comprobaciones

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/domain.test.ts tests/export.test.ts
```

## Navegación y diseño

Inicio reúne prioridades y próximos eventos de la semana. La barra de módulos permite cambiar de área sin pasar por Inicio. El tema oscuro comparte colores, superficies y controles; la navegación se desplaza horizontalmente en pantallas pequeñas.

La URL conserva módulo, búsqueda, filtros, proyecto, vista del proyecto y orden de facturas. Puedes copiarla para volver al mismo contexto. Atrás/Adelante recupera destinos anteriores; escribir una búsqueda no crea una entrada por letra. Los filtros de otras vistas se recuerdan en el historial de esa pestaña, incluso tras recargar. No se comparten con otros usuarios ni sustituyen los permisos del equipo.

Ejemplos:

- `/?view=Pipeline&q=Acme&overdue=1`
- `/?view=Facturas&filter=overdue&sort=amount`
- `/?view=Proyectos&project=ID&tab=list`

Hoy, Agenda, Informes, OCR, el detalle de proyecto, la configuración del pipeline, el panel de factura y el bot se cargan al utilizarlos. El bot conserva su conversación al cerrar el panel durante la sesión.

Para ejecutar la suite completa de dominio y navegación con el cargador TypeScript disponible:

```sh
node --import tsx --test tests/*.test.ts
```

La prueba `tests/server.test.mjs` requiere el servidor de producción local de Wrangler en el puerto 5174, con una base temporal inicializada mediante la migración. El servidor de desarrollo elimina las cabeceras de identidad enviadas por el cliente y no sirve para esta prueba. Consulta `docs/upgrade-2026-10-07.md` para la validación y los pendientes actuales.
