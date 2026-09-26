# Pipeline UX

Orden del tablero, filtros y densidad de cards.

## Etapas configurables

Cada espacio tiene su mapa `pipelineStages` con ids estables. Las oportunidades guardan `stageId`. Solo el propietario crea, renombra, reordena o archiva etapas (sin archivar si hay deals en esa columna).

## Orden dentro de una columna

- Cada oportunidad tiene un `rank` numérico por espacio (único orden compartido del board).
- Dentro de una columna, las cards se ordenan por `rank` ascendente y, a igualdad, por `id`.
- Al crear una oportunidad o al cambiarla de etapa, entra al **final** de la columna destino (`rank = max + 1`).
- En la card puedes **Subir** / **Bajar** (acción `rankOpportunity`) para intercambiar posición con la vecina.
- Arrastrar entre columnas cambia la etapa; no reordena dentro de la misma columna (usa Subir/Bajar).

## Filtros del Pipeline

Disponibles en la barra del tablero:

| Filtro | Efecto |
|--------|--------|
| Búsqueda | Título, empresa, etapa, siguiente paso y nombres de etiquetas |
| Empresa | Limita a una empresa |
| Etiqueta | Solo oportunidades con esa etiqueta |
| Responsable | Miembro, «Sin asignar» o «Mis oportunidades» |
| MRR mínimo | Oportunidades con MRR ≥ valor |
| Seguimiento vencido | Solo con siguiente paso o tarea vencida |
| Compacta | Oculta el bloque de siguiente paso en la card |

**Limpiar filtros** restablece búsqueda, empresa y filtros avanzados (no la densidad compacta).

La exportación CSV del Pipeline aplica los mismos filtros avanzados que el tablero.

## Densidad compacta

En modo compacto la card muestra título, importe/MRR, chips de etiqueta y estado; el detalle del siguiente paso queda para la ficha.

## Fase 2 — Etiquetas
Catálogo `opportunityTags`, chips en card (máx. 3 +N) y filtro/búsqueda por etiqueta.

## Fase 3 — MRR
Campo opcional `mrr`, total por columna, CSV e Informes (MRR abierto).

## Fase 4 — Historial
`stageHistory` inmutable al cambiar etapa; `daysInStage` desde la última transición.

## Fase 5 — SLA / metas / WIP
Indicador de días y SLA, meta semanal por columna, toast al ganar, WIP warn/block.

## Fase 6 — Probabilidad, responsable y pérdida
% por etapa, forecast ponderado, `ownerUserId`, motivos de pérdida obligatorios al cerrar en lost.
