'use client';

import { ArrowRight } from 'lucide-react';
import { businessReport, type ReportStuck } from '@/lib/reports';
import { eur, type State } from '@/lib/crm';

export function ReportsView({
  state,
  onOpenStuck,
  onOpenProject,
}: {
  state: State;
  onOpenStuck: (item: ReportStuck) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const report = businessReport(state);
  return (
    <div className="reports-view">
      <p className="reports-period">Periodo {report.periodStart} · {report.periodEnd}</p>

      <section className="report-block" aria-labelledby="report-funnel">
        <h2 id="report-funnel">Embudo por etapa</h2>
        <table className="report-table">
          <thead><tr><th>Etapa</th><th>Oportunidades</th><th>Importe</th></tr></thead>
          <tbody>
            {report.funnel.map(row => (
              <tr key={row.stage}><td>{row.stage}</td><td>{row.count}</td><td className="numeric">{eur(row.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="report-block" aria-labelledby="report-close">
        <h2 id="report-close">Cierres del periodo</h2>
        <div className="report-stats">
          <div><span>Ganadas</span><strong>{report.won.count}</strong><small>{eur(report.won.amount)}</small></div>
          <div><span>Perdidas</span><strong>{report.lost.count}</strong><small>{eur(report.lost.amount)}</small></div>
          <div><span>Cobros del mes</span><strong>{report.collectedThisMonth.count}</strong><small>{eur(report.collectedThisMonth.amount)}</small></div>
          <div><span>MRR abierto</span><strong>{eur(report.openMrr)}</strong><small>/ mes</small></div>
          <div><span>Forecast ponderado</span><strong>{eur(report.weightedForecast)}</strong><small>importe × %</small></div>
        </div>
      </section>

      {report.lostReasons.length > 0 && (
        <section className="report-block" aria-labelledby="report-lost-reasons">
          <h2 id="report-lost-reasons">Motivos de pérdida</h2>
          <table className="report-table">
            <thead><tr><th>Motivo</th><th>Cantidad</th><th>Importe</th></tr></thead>
            <tbody>
              {report.lostReasons.map(row => (
                <tr key={row.reasonId}><td>{row.name}</td><td>{row.count}</td><td className="numeric">{eur(row.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.margins.length > 0 && (
        <section className="report-block" aria-labelledby="report-margin">
          <h2 id="report-margin">Margen por proyecto</h2>
          <ul className="report-list">
            {report.margins.map(row => (
              <li key={row.projectId}>
                <button type="button" className="report-row" onClick={() => onOpenProject(row.projectId)}>
                  <span><strong>{row.title}</strong><small>Ingresos {eur(row.revenue)} · Coste {eur(row.cost)}</small></span>
                  <strong className={row.margin < 0 ? 'red' : ''}>{eur(row.margin)}</strong>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.stuck.length > 0 && (
        <section className="report-block" aria-labelledby="report-stuck">
          <h2 id="report-stuck">Qué se atasca <span className="count">{report.stuck.length}</span></h2>
          <ul className="report-list">
            {report.stuck.map(item => (
              <li key={item.id}>
                <button type="button" className="report-row" onClick={() => onOpenStuck(item)}>
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
