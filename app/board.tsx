'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { ArrowRight, GripVertical, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type BoardColumn = { key: string; label: string; tone: number; total?: string };
export type BoardCard = { title: string; subtitle?: string; aside?: string; note?: string; meta?: string; chip: ReactNode; tools?: ReactNode };
type Item = { id: string };
type BoardProps<T extends Item> = {
  label: string; columns: BoardColumn[]; items: T[]; columnOf: (item: T) => string;
  busy: boolean; onOpen: (item: T) => void; onMove: (item: T, to: string) => void;
  card: (item: T) => BoardCard; onCreate?: (column: string) => void; filtered?: boolean;
};

// Pointer drops must be inside a column: dropping outside cancels the move.
const collisions: CollisionDetection = args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
const columnCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (!['ArrowRight', 'ArrowLeft'].includes(event.code)) return;
  event.preventDefault();
  const columns = context.droppableContainers.getEnabled();
  const current = columns.findIndex(column => column.id === (context.over?.id ?? context.active?.data.current?.column));
  const next = columns[current + (event.code === 'ArrowRight' ? 1 : -1)];
  const rect = next && context.droppableRects.get(next.id);
  const active = context.collisionRect;
  if (rect && active) return {
    x: currentCoordinates.x + rect.left + rect.width / 2 - active.left - active.width / 2,
    y: currentCoordinates.y,
  };
};

function CardContent({ content, handle, onOpen, children }: { content: BoardCard; handle?: ReactNode; onOpen?: () => void; children?: ReactNode }) {
  return <>
    <div className="record-title">
      <span>{content.subtitle && <small className="board-company">{content.subtitle}</small>}
        {onOpen ? <button type="button" className="record-open" onClick={onOpen}>{content.title}</button> : <strong className="record-open">{content.title}</strong>}
      </span>{handle}
    </div>
    {content.aside && <strong className="board-aside">{content.aside}</strong>}
    {content.note && <div className="board-next"><span>Siguiente paso</span><p>{content.note}</p>{content.meta && <small>{content.meta}</small>}</div>}
    <div className="row-foot">{content.chip}{children}</div>
  </>;
}

function BoardRecord({ id, column, content, columns, busy, onOpen, onMove }: {
  id: string; column: string; content: BoardCard; columns: BoardColumn[]; busy: boolean;
  onOpen: () => void; onMove: (to: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id, disabled: busy, data: { column, title: content.title } });
  return <article ref={setNodeRef} className={'board-card' + (isDragging ? ' dragging' : '')} data-record-id={id} onClick={event => { if (event.currentTarget.contains(event.target as Node) && !(event.target as HTMLElement).closest('button,[role="menuitem"]')) onOpen(); }}>
    <CardContent content={content} onOpen={onOpen} handle={
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={busy}
        className="drag-handle" aria-label={'Arrastrar ' + content.title} title="Arrastrar · Espacio y flechas para mover">
        <GripVertical size={17}/>
      </button>
    }>
      <span className="row-actions">{content.tools}<DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className="compact-action board-move" disabled={busy} aria-label={'Mover ' + content.title}>Mover <ArrowRight size={13}/></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="board-move-menu">
          <DropdownMenuLabel>Mover a otra etapa</DropdownMenuLabel>
          {columns.filter(option => option.key !== column).map(option => <DropdownMenuItem key={option.key} disabled={busy} onSelect={() => onMove(option.key)}>{option.label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu></span>
    </CardContent>
  </article>;
}

function Column({ column, count, children, dragging, onCreate, filtered, busy }: {
  column: BoardColumn; count: number; children: ReactNode; dragging: boolean;
  onCreate?: () => void; filtered?: boolean; busy: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: busy });
  const heading = useId();
  return <section ref={setNodeRef} className={'board-column tone-' + column.tone + (isOver && dragging ? ' drop-over' : '')} aria-labelledby={heading} data-column={column.key}>
    <header><div className="board-column-title"><span className="board-dot"/><h3 id={heading}>{column.label}</h3><span className="count">{count}</span>
      {onCreate && <button className="icon-button board-add" type="button" disabled={busy} aria-label={'Nueva oportunidad en ' + column.label} onClick={onCreate}><Plus size={16}/></button>}
    </div>{column.total && <strong className="board-total">{column.total}<small>Importe estimado</small></strong>}</header>
    <div className="board-records">{children}{!count && <div className="column-empty">{dragging ? 'Suelta aquí' : filtered ? 'Sin coincidencias' : onCreate ? 'Sin oportunidades en esta etapa' : 'Sin tareas en esta etapa'}
      {!dragging && !filtered && onCreate && <button className="subtle" type="button" disabled={busy} onClick={onCreate}><Plus size={14}/> Añadir oportunidad</button>}
    </div>}</div>
  </section>;
}

export function Board<T extends Item>({ label, columns, items, columnOf, busy, onOpen, onMove, card, onCreate, filtered }: BoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ id: string; handle: boolean } | null>(null);
  useEffect(() => {
    if (busy || !pendingFocus.current) return;
    const target = pendingFocus.current;
    const frame = requestAnimationFrame(() => {
      const record = Array.from(boardRef.current?.querySelectorAll<HTMLElement>('[data-record-id]') ?? []).find(node => node.dataset.recordId === target.id);
      record?.querySelector<HTMLElement>(target.handle ? '.drag-handle' : '.board-move')?.focus({ preventScroll: true });
      pendingFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [busy, items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );
  const activeItem = items.find(item => item.id === activeId);
  // Focus follows the same record after it changes column and React remounts it.
  function move(item: T, to: string, handle = false) {
    if (busy || to === columnOf(item) || !columns.some(column => column.key === to)) return;
    pendingFocus.current = { id: item.id, handle };
    onMove(item, to);
  }
  return <DndContext sensors={sensors} collisionDetection={collisions}
    autoScroll={{ threshold: { x: .12, y: .12 }, acceleration: 8 }}
    accessibility={{
      restoreFocus: false,
      screenReaderInstructions: { draggable: 'Pulsa Espacio para recoger. Usa las flechas izquierda y derecha para cambiar de etapa. Espacio para soltar o Escape para cancelar. También puedes usar el botón Mover.' },
      announcements: {
        onDragStart: ({ active }) => `Has recogido ${active.data.current?.title ?? 'el registro'}.`,
        onDragOver: ({ over }) => over ? `Destino: ${over.id}.` : 'Fuera del tablero. Suelta para cancelar.',
        onDragEnd: ({ over }) => over ? `Soltado en ${over.id}.` : 'Movimiento cancelado.',
        onDragCancel: () => 'Movimiento cancelado.',
      },
    }}
    onDragStart={({ active }) => setActiveId(String(active.id))}
    onDragCancel={() => setActiveId(null)}
    onDragEnd={({ active, over, activatorEvent }) => {
      setActiveId(null);
      const item = items.find(item => item.id === active.id);
      if (item && over) move(item, String(over.id), activatorEvent instanceof KeyboardEvent);
    }}>
    <div ref={boardRef} className={'board' + (activeId ? ' board-dragging' : '')} role="region" aria-label={label} tabIndex={0}>
      {columns.map(column => {
        const list = items.filter(item => columnOf(item) === column.key);
        return <Column key={column.key} column={column} count={list.length} dragging={!!activeId} busy={busy} filtered={filtered} onCreate={onCreate ? () => onCreate(column.key) : undefined}>
          {list.map(item => <BoardRecord key={item.id} id={item.id} column={column.key} content={card(item)} columns={columns} busy={busy} onOpen={() => onOpen(item)} onMove={to => move(item, to)}/>)}
        </Column>;
      })}
    </div>
    <DragOverlay dropAnimation={null} zIndex={60}>
      {activeItem && <div className="board-card board-card-overlay" aria-hidden="true"><CardContent content={card(activeItem)} handle={<GripVertical size={17}/>}/></div>}
    </DragOverlay>
  </DndContext>;
}
