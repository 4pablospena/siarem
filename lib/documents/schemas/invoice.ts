/** Tool input_schema for purchase invoices (Spanish commercial docs). */
export const invoiceToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['records'],
  properties: {
    records: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'cantidad', 'role'],
        properties: {
          role: { type: 'string', enum: ['item', 'checksum', 'duplicate'] },
          tipo: { type: 'string', enum: ['factura', 'albaran', 'otro'] },
          cantidad: {
            type: 'number',
            description: 'Importe total con IVA del registro (misma cifra que amount). Si falta, 0.',
          },
          taxId: { type: 'string', description: 'NIF/CIF del proveedor. "" si no aparece.' },
          supplierName: { type: 'string' },
          number: { type: 'string', description: 'Número de factura o albarán.' },
          date: { type: 'string', description: 'Fecha de emisión DD/MM/AAAA o vacío.' },
          dueDate: { type: 'string', description: 'Vencimiento DD/MM/AAAA o vacío.' },
          base: { type: 'number' },
          vatRate: { type: 'number' },
          vatAmount: { type: 'number' },
          amount: { type: 'number', description: 'Total con IVA.' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['description', 'quantity', 'price', 'amount'],
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                price: { type: 'number' },
                amount: { type: 'number' },
              },
            },
          },
          rawPreview: { type: 'string', description: 'Recorte breve del texto leído.' },
        },
      },
    },
  },
} as const;

export const invoiceSystemPrompt = `Eres un extractor de documentos comerciales españoles (facturas de proveedor, albaranes).
Un registro es una entidad (proveedor) + un periodo/documento, no "una página". Un PDF puede traer varios registros.

Números españoles: 1.234,56 → 1234.56. Un punto de miles sin coma decimal (p. ej. 20.409) no es un decimal: es 20409.
Si falta un dato: número → 0, texto → "". No inventes NIF ni números de factura.

Fechas del documento: DD/MM/AAAA, DD.MM.AAAA o DD-MM-AAAA. Devuélvelas como DD/MM/AAAA.
Si solo hay una fecha, úsala en date y dueDate.

role:
- item: dato que se puede guardar como gasto.
- checksum: total de comprobación, no se persiste.
- duplicate: copia de algo ya extraído en otro registro.

Rellena la herramienta extract_document. Si contestas en texto, el cuerpo es solo JSON con { "records": [...] }.
No inventes claves fuera del esquema.`;
