import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../lib/crm.ts';
import {csvExport} from '../lib/export.ts';
test('CSV applies live search, company, status filters and includes displayed next step',()=>{const s=seed();const csv=csvExport(s,'Foco','Peña','2','demo-company');assert.match(csv,/segunda fase/);assert.doesNotMatch(csv,/primera fase/);assert.match(csv,/Llamar para revisar la propuesta/);assert.equal(csvExport(s,'Empresas','absent').split('\r\n').length,1);assert.equal(csvExport(s,'Facturas','','paid').split('\r\n').length,1);assert.match(csvExport(s,'Ventas','','orders'),/"Pedido"/);assert.doesNotMatch(csvExport(s,'Ventas','','orders'),/"Presupuesto"/)});
test('CSV is spreadsheet-safe and escapes delimiters, quotes and line breaks',()=>{const s=seed();s.companies[0].name='=HYPERLINK("example")';s.companies[0].contact='Nombre; con\nsalto';const csv=csvExport(s,'Empresas');assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"'=HYPERLINK\(""example""\)"/);assert.match(csv,/"Nombre; con\nsalto"/)});
