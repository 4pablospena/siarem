import type { LucideIcon } from 'lucide-react';
import { Crosshair, Columns3, Building2, FileText, FolderKanban, Inbox, ChartColumn } from 'lucide-react';

export type AreaView = 'Foco' | 'Agenda' | 'Informes' | 'Leads' | 'Pipeline' | 'Empresas' | 'Catálogo' | 'Ventas' | 'Proyectos' | 'Facturas';

export type Area = {
  name: string;
  icon: LucideIcon;
  views: AreaView[];
  labels?: Partial<Record<AreaView, string>>;
};

/**
 * Home areas. Pipeline and Proyectos are first-class modules.
 * Internal view names stay stable for export and filters.
 */
export const areas: Area[] = [
  { name: 'Hoy', icon: Crosshair, views: ['Foco', 'Agenda'], labels: { Foco: 'Por atender', Agenda: 'Agenda' } },
  { name: 'Pipeline', icon: Columns3, views: ['Pipeline'] },
  { name: 'Proyectos', icon: FolderKanban, views: ['Proyectos'] },
  { name: 'Leads', icon: Inbox, views: ['Leads'] },
  { name: 'Clientes', icon: Building2, views: ['Empresas', 'Catálogo'], labels: { Empresas: 'Empresas', Catálogo: 'Catálogo' } },
  { name: 'Facturación', icon: FileText, views: ['Ventas', 'Facturas'], labels: { Ventas: 'Presupuestos y pedidos', Facturas: 'Facturas' } },
  { name: 'Informes', icon: ChartColumn, views: ['Informes'] },
];

export const viewNames = areas.flatMap(area => area.views);

export function areaOf(view: string): Area | undefined {
  return areas.find(area => (area.views as string[]).includes(view));
}

export function areaLabel(area: Area, view: AreaView) {
  return area.labels?.[view] || view;
}

export function navigateTargets() {
  return ['Inicio', ...areas.map(area => area.name), ...viewNames];
}
