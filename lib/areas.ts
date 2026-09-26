import type { LucideIcon } from 'lucide-react';
import { Crosshair, Columns3, Building2, FileText, FolderKanban, Inbox, ChartColumn, ScanText } from 'lucide-react';

export type AreaView = 'Foco' | 'Agenda' | 'Informes' | 'Leads' | 'Pipeline' | 'Empresas' | 'Catálogo' | 'Contratos' | 'Ventas' | 'Facturas' | 'Gastos' | 'OCR' | 'Proyectos';

export type Area = {
  name: string;
  icon: LucideIcon;
  views: AreaView[];
  labels?: Partial<Record<AreaView, string>>;
};

/**
 * Home areas. Pipeline, Proyectos and OCR are first-class modules.
 * Internal view names stay stable for export and filters.
 */
export const areas: Area[] = [
  { name: 'Hoy', icon: Crosshair, views: ['Foco', 'Agenda'], labels: { Foco: 'Por atender', Agenda: 'Agenda' } },
  { name: 'Pipeline', icon: Columns3, views: ['Pipeline'] },
  { name: 'Proyectos', icon: FolderKanban, views: ['Proyectos'] },
  { name: 'Leads', icon: Inbox, views: ['Leads'] },
  { name: 'Clientes', icon: Building2, views: ['Empresas', 'Catálogo', 'Contratos'], labels: { Empresas: 'Empresas', Catálogo: 'Catálogo', Contratos: 'Contratos' } },
  { name: 'Facturación', icon: FileText, views: ['Ventas', 'Facturas', 'Gastos'], labels: { Ventas: 'Presupuestos y pedidos', Facturas: 'Facturas', Gastos: 'Gastos' } },
  { name: 'OCR', icon: ScanText, views: ['OCR'] },
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
