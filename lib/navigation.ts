/** Shareable workspace state. Only navigation preferences belong in the URL. */
export const workspaceViews = ['Inicio', 'Foco', 'Agenda', 'Informes', 'Leads', 'Pipeline', 'Empresas', 'Catálogo', 'Contratos', 'Ventas', 'Facturas', 'Gastos', 'OCR', 'Proyectos'] as const;
export type WorkspaceView = typeof workspaceViews[number];
export type NavigationState = {
  view: WorkspaceView; query: string; filter: string; companyFilter: string;
  projectFocus: string | null; projectLens: 'board' | 'people' | 'list' | 'weeks';
  projectTagFilter: string; projectAssigneeFilter: string;
  tagFilter: string; ownerFilter: string; minMrr: number | null;
  overdueOnly: boolean; mineOnly: boolean; compactCards: boolean;
  invoiceSort: 'due' | 'amount' | 'company';
};
export const defaultNavigation: NavigationState = {
  view: 'Inicio', query: '', filter: 'all', companyFilter: 'all',
  projectFocus: null, projectLens: 'board', projectTagFilter: 'all', projectAssigneeFilter: 'all',
  tagFilter: 'all', ownerFilter: 'all', minMrr: null, overdueOnly: false,
  mineOnly: false, compactCards: false, invoiceSort: 'due',
};
const parameters: Record<keyof NavigationState, string> = {
  view: 'view', query: 'q', filter: 'filter', companyFilter: 'company', projectFocus: 'project',
  projectLens: 'tab', projectTagFilter: 'projectTag', projectAssigneeFilter: 'assignee',
  tagFilter: 'tag', ownerFilter: 'owner', minMrr: 'mrr', overdueOnly: 'overdue',
  mineOnly: 'mine', compactCards: 'compact', invoiceSort: 'sort',
};
export function readNavigation(search: string): NavigationState {
  const p = new URLSearchParams(search);
  const view = p.get('view');
  const state = { ...defaultNavigation, view: workspaceViews.includes(view as WorkspaceView) ? view as WorkspaceView : 'Inicio' as const };
  for (const key of ['query', 'filter', 'companyFilter', 'projectTagFilter', 'projectAssigneeFilter', 'tagFilter', 'ownerFilter'] as const) {
    const value = p.get(parameters[key]);
    if (value) state[key] = value.slice(0, 500);
  }
  if (state.view === 'Proyectos') {
    state.projectFocus = p.get('project')?.slice(0, 200) || null;
    const tab = p.get('tab');
    if (tab === 'people' || tab === 'list' || tab === 'weeks') state.projectLens = tab;
  }
  const mrr = p.get('mrr');
  if (mrr !== null && mrr.trim() !== '' && Number.isFinite(Number(mrr)) && Number(mrr) >= 0) state.minMrr = Number(mrr);
  for (const key of ['overdueOnly', 'mineOnly', 'compactCards'] as const) state[key] = p.get(parameters[key]) === '1';
  const sort = p.get('sort');
  if (sort === 'amount' || sort === 'company') state.invoiceSort = sort;
  return state;
}
export function navigationSearch(state: NavigationState): string {
  const p = new URLSearchParams();
  for (const key of Object.keys(parameters) as (keyof NavigationState)[]) {
    const value = state[key];
    if (value !== defaultNavigation[key] && value !== null) p.set(parameters[key], typeof value === 'boolean' ? '1' : String(value));
  }
  return p.size ? `?${p}` : '';
}
export function navigationKey(state: NavigationState): string {
  return `${state.view}:${state.projectFocus || ''}`;
}
export function navigationMode(previous: NavigationState, next: NavigationState): 'push' | 'replace' {
  return navigationKey(previous) !== navigationKey(next) || previous.projectLens !== next.projectLens ? 'push' : 'replace';
}
