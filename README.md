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

**Hermes** es un panel de ayuda. No modifica los registros por su cuenta. Cada vista se puede exportar a CSV.

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
