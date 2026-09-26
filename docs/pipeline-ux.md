# Pipeline UX

Orden del tablero, filtros y densidad de cards.

## Etapas configurables

Cada espacio tiene su mapa `pipelineStages` con ids estables. Las oportunidades guardan `stageId`. Solo el propietario crea, renombra, reordena o archiva etapas (sin archivar si hay deals en esa columna).

## Orden dentro de una columna

- Cada oportunidad tiene un `rank` numérico por espacio (único orden compartido del board).
- Dentro de una columna, las cards se ordenan por `rank` ascendente y, a igualdad, por `id`.
- Al crear una oportunidad entra al **final** de su columna (`rank = max + 1`).
- Todo se mueve arrastrando la card entera: soltarla sobre otra card la coloca delante o detrás (según la mitad donde caiga, con una línea guía); soltarla en el hueco de la columna la deja al final. Cambiar de etapa y reordenar es un solo gesto (`stage` o `rankOpportunity` con `beforeId`).
- Con teclado: foco en el asa, Espacio para recoger, flechas izquierda/derecha para cambiar de etapa, Espacio para soltar.

## Card

- Cabecera: empresa y prioridad de 0 a 3 estrellas (`priority`); clic en una estrella la fija y clic en la misma la quita.
- Importe y MRR, etiquetas y siguiente paso (en rojo si está vencido).
- Pie: avatar del responsable (clic para reasignar o dejar sin asignar) y estado. Si la oportunidad supera el SLA de su etapa aparece un aviso «N d».
- Prioridad y responsable se guardan con `patchOpportunity`, sin reenviar la ficha completa.

## Filtros del Pipeline

La barra muestra solo los accesos frecuentes; el resto vive en el desplegable **Filtros**:

| Filtro | Dónde | Efecto |
|--------|-------|--------|
| Búsqueda | Barra | Título, empresa, etapa, siguiente paso y nombres de etiquetas |
| Empresa | Barra | Limita a una empresa |
| Mías | Barra | Atajo de Responsable = yo |
| Vencidas | Barra | Solo con siguiente paso o tarea vencida |
| Etiqueta | Filtros | Solo oportunidades con esa etiqueta |
| Responsable | Filtros | Miembro o «Sin asignar» |
| MRR mínimo | Filtros | Oportunidades con MRR ≥ valor |
| Densidad | Barra (iconos) | Normal o compacta |

Cada filtro activo aparece como chip bajo la barra; la X del chip lo quita y **Limpiar todo** restablece búsqueda, empresa y filtros (no la densidad). El botón Filtros muestra cuántos filtros secundarios hay activos. Las etapas se configuran desde **Configurar** en la cabecera (solo owner).

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

## Fase 7 — Orden y filtros
Rank en columna, filtros avanzados y vista compacta (detalle arriba en este documento).

## Fase 8 — Siarem-bot
Brief con stageIds/tags/MRR; acción stage validada contra el mapa del espacio.
