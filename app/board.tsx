'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type Active, type CollisionDetection, type KeyboardCoordinateGetter, type Over,
} from '@dnd-kit/core';
import { CornerDownRight, GripVertical, Plus } from 'lucide-react';

export type BoardColumn = { key: string; label: string; tone: number; total?: string; subtotal?: string; hint?: string; warn?: string; progress?: number };
export type BoardCard = {
  title: string; subtitle?: string; aside?: ReactNode; note?: string; meta?: string; overdue?: boolean;
  chip: ReactNode; tools?: ReactNode; tags?: ReactNode; corner?: ReactNode; footer?: ReactNode;
};
type Item = { id: string };
type BoardProps<T extends Item> = {
  label: string; columns: BoardColumn[]; items: T[]; columnOf: (item: T) => string;
  busy: boolean; onOpen: (item: T) => void;
  /** With `sortable`, `beforeId` is the card the item lands in front of (`null` = end of column). */
  onMove: (item: T, to: string, beforeId?: string | null) => void;
  card: (item: T) => BoardCard; onCreate?: (column: string) => void; filtered?: boolean;
  compact?: boolean; sortable?: boolean;
};
type DropHint = { id: string; after: boolean } | null;

const CARD = 'card:';
const isCard = (id: unknown) => String(id).startsWith(CARD);
const columnOfDrop = (over: Over | null) => over ? String(over.data.current?.column ?? over.id) : '';

// Pointer drops must be inside a column: dropping outside cancels the move. Cards win over their column.
const collisions: CollisionDetection = args => {
  if (!args.pointerCoordinates) return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => !isCard(c.id)) });
  const hits = pointerWithin(args).filter(hit => hit.id !== CARD + args.active.id);
  const card = hits.find(hit => isCard(hit.id));
  return card ? [card] : hits;
};
const columnCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (!['ArrowRight', 'ArrowLeft'].includes(event.code)) return;
  event.preventDefault();
  const columns = context.droppableContainers.getEnabled().filter(c => !isCard(c.id));
  const current = columns.findIndex(column => column.id === (context.over ? columnOfDrop(context.over) : context.active?.data.current?.column));
  const next = columns[current + (event.code === 'ArrowRight' ? 1 : -1)];
  const rect = next && context.droppableRects.get(next.id);
  const active = context.collisionRect;
  if (rect && active) return {
    x: currentCoordinates.x + rect.left + rect.width / 2 - active.left - active.width / 2,
    y: currentCoordinates.y,
  };
};
function hintFor(active: Active, over: Over | null): DropHint {
  if (!over || !isCard(over.id)) return null;
  const dragged = active.rect.current.translated;
  const after = !!dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2;
  return { id: String(over.id).slice(CARD.length), after };
}

function CardContent({ content, handle, onOpen, compact }: { content: BoardCard; handle?: ReactNode; onOpen?: () => void; compact?: boolean }) {
  return <>
    <div className="card-top">
      {content.subtitle && <small className="board-company">{content.subtitle}</small>}
      {content.corner}{handle}
    </div>
    {onOpen ? <button type="button" className="record-open" onClick={onOpen}>{content.title}</button> : <strong className="record-open">{content.title}</strong>}
    {content.tags}
    {content.aside && <div className="board-aside">{content.aside}</div>}
    {!compact && content.note && <div className={'board-next' + (content.overdue ? ' overdue' : '')}>
      <CornerDownRight size={13} aria-hidden="true"/><p>{content.note}</p>{content.meta && <small>{content.meta}</small>}
    </div>}
    <div className="row-foot">{content.footer ?? content.chip}
      {(content.footer || content.tools) && <span className="row-actions">{content.footer && content.chip}{content.tools}</span>}
    </div>
  </>;
}

function BoardRecord({ id, column, content, busy, onOpen, compact, hint, sortable }: {
  id: string; column: string; content: BoardCard; busy: boolean; onOpen: () => void; compact?: boolean; hint: DropHint; sortable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id, disabled: busy, data: { column, title: content.title } });
  const drop = useDroppable({ id: CARD + id, disabled: busy || !sortable, data: { column } });
  const edge = hint?.id === id ? (hint.after ? ' drop-after' : ' drop-before') : '';
  return <article ref={node => { setNodeRef(node); drop.setNodeRef(node); }} {...listeners}
    className={'board-card' + (isDragging ? ' dragging' : '') + (compact ? ' compact' : '') + edge} data-record-id={id}>
    <CardContent content={content} onOpen={onOpen} compact={compact} handle={
      <button type="button" ref={setActivatorNodeRef} {...attributes} disabled={busy}
        className="drag-handle" aria-label={'Arrastrar ' + content.title} title="Arrastra la tarjeta · Espacio y flechas con teclado">
        <GripVertical size={15}/>
      </button>
    }/>
  </article>;
}

function Column({ column, count, children, dragging, onCreate, filtered, busy }: {
  column: BoardColumn; count: number; children: ReactNode; dragging: boolean;
  onCreate?: () => void; filtered?: boolean; busy: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: busy, data: { column: column.key } });
  const heading = useId();
  return <section ref={setNodeRef} className={'board-column tone-' + column.tone + (isOver && dragging ? ' drop-over' : '')} aria-labelledby={heading} data-column={column.key}>
    <header><div className="board-column-title"><span className="board-dot"/><h3 id={heading}>{column.label}</h3><span className="count">{count}</span>
      {column.warn && <span className="board-warn" title="Límite de trabajo en curso alcanzado">{column.warn}</span>}
      {onCreate && <button className="icon-button board-add" type="button" disabled={busy} aria-label={'Nueva oportunidad en ' + column.label} onClick={onCreate}><Plus size={16}/></button>}
    </div>{column.total && <div className="board-total"><strong>{column.total}</strong>{column.subtotal && <span>+ {column.subtotal}</span>}</div>}
    {column.hint && <div className="board-goal"><small>{column.hint}</small>{column.progress != null && <span className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, column.progress) * 100)}><span style={{ width: `${Math.min(1, column.progress) * 100}%` }}/></span>}</div>}
    </header>
    <div className="board-records">{children}{!count && <div className="column-empty">{dragging ? 'Suelta aquí' : filtered ? 'Sin coincidencias' : onCreate ? 'Sin oportunidades en esta etapa' : 'Sin tareas en esta etapa'}
      {!dragging && !filtered && onCreate && <button className="subtle" type="button" disabled={busy} onClick={onCreate}><Plus size={14}/> Añadir oportunidad</button>}
    </div>}</div>
  </section>;
}

export function Board<T extends Item>({ label, columns, items, columnOf, busy, onOpen, onMove, card, onCreate, filtered, compact, sortable }: BoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (busy || !pendingFocus.current) return;
    const target = pendingFocus.current;
    const frame = requestAnimationFrame(() => {
      const record = Array.from(boardRef.current?.querySelectorAll<HTMLElement>('[data-record-id]') ?? []).find(node => node.dataset.recordId === target);
      record?.querySelector<HTMLElement>('.drag-handle')?.focus({ preventScroll: true });
      pendingFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [busy, items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );
  const activeItem = items.find(item => item.id === activeId);
  function updateHint(next: DropHint) {
    setHint(current => current?.id === next?.id && current?.after === next?.after ? current : next);
  }
  function drop(item: T, over: Over, nextHint: DropHint, keyboard: boolean) {
    const to = columnOfDrop(over);
    if (busy || !columns.some(column => column.key === to)) return;
    const from = columnOf(item);
    if (!sortable) {
      if (to === from) return;
      if (keyboard) pendingFocus.current = item.id;
      onMove(item, to);
      return;
    }
    const others = items.filter(other => other.id !== item.id && columnOf(other) === to);
    let beforeId: string | null = null;
    if (nextHint) {
      const index = others.findIndex(other => other.id === nextHint.id);
      beforeId = index < 0 ? null : nextHint.after ? others[index + 1]?.id ?? null : nextHint.id;
    }
    if (to === from) {
      const column = items.filter(other => columnOf(other) === to);
      const currentNext = column[column.findIndex(other => other.id === item.id) + 1]?.id ?? null;
      if (currentNext === beforeId) return;
    }
    if (keyboard) pendingFocus.current = item.id;
    onMove(item, to, beforeId);
  }
  return <DndContext sensors={sensors} collisionDetection={collisions}
    autoScroll={{ threshold: { x: .12, y: .12 }, acceleration: 8 }}
    accessibility={{
      restoreFocus: false,
      screenReaderInstructions: { draggable: 'Pulsa Espacio para recoger. Usa las flechas izquierda y derecha para cambiar de columna. Espacio para soltar o Escape para cancelar.' },
      announcements: {
        onDragStart: ({ active }) => `Has recogido ${active.data.current?.title ?? 'el registro'}.`,
        onDragOver: ({ over }) => over ? `Destino: ${columns.find(column => column.key === columnOfDrop(over))?.label ?? columnOfDrop(over)}.` : 'Fuera del tablero. Suelta para cancelar.',
        onDragEnd: ({ over }) => over ? `Soltado en ${columns.find(column => column.key === columnOfDrop(over))?.label ?? columnOfDrop(over)}.` : 'Movimiento cancelado.',
        onDragCancel: () => 'Movimiento cancelado.',
      },
    }}
    onDragStart={({ active }) => setActiveId(String(active.id))}
    onDragMove={({ active, over }) => sortable && updateHint(hintFor(active, over))}
    onDragCancel={() => { setActiveId(null); setHint(null); }}
    onDragEnd={({ active, over, activatorEvent }) => {
      const finalHint = sortable ? hintFor(active, over) : null;
      setActiveId(null); setHint(null);
      const item = items.find(item => item.id === active.id);
      if (item && over) drop(item, over, finalHint, activatorEvent instanceof KeyboardEvent);
    }}>
    <div ref={boardRef} className={'board' + (activeId ? ' board-dragging' : '')} role="region" aria-label={label} tabIndex={0}>
      {columns.map(column => {
        const list = items.filter(item => columnOf(item) === column.key);
        return <Column key={column.key} column={column} count={list.length} dragging={!!activeId} busy={busy} filtered={filtered} onCreate={onCreate ? () => onCreate(column.key) : undefined}>
          {list.map(item => <BoardRecord key={item.id} id={item.id} column={column.key} content={card(item)} busy={busy} compact={compact} sortable={sortable} hint={hint} onOpen={() => onOpen(item)}/>)}
        </Column>;
      })}
    </div>
    <DragOverlay dropAnimation={null} zIndex={60}>
      {activeItem && <div className={'board-card board-card-overlay' + (compact ? ' compact' : '')} aria-hidden="true"><CardContent content={card(activeItem)} compact={compact} handle={<span className="drag-handle"><GripVertical size={15}/></span>}/></div>}
    </DragOverlay>
  </DndContext>;
}
