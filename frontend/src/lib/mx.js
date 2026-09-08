// Catálogos geográficos compartidos

// Las 16 divisiones de distribución de CFE
export const CFE_DIVISIONS = [
  'Baja California', 'Noroeste', 'Norte', 'Golfo Norte', 'Golfo Centro', 'Bajío',
  'Jalisco', 'Centro Occidente', 'Centro Sur', 'Centro Oriente', 'Oriente',
  'Sureste', 'Peninsular', 'Valle de México Norte', 'Valle de México Centro', 'Valle de México Sur'
]

export const MX_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
  'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
]

// Resuelve el precio de venta de un concepto según el contexto del contrato:
// cliente específico > división CFE / estado > precio base del catálogo
export function resolveConceptPrice(concept, ctx) {
  const prices = concept.prices || []
  const find = (type, scope) => scope && prices.find(p => p.scopeType === type && p.scope.toLowerCase() === scope.toLowerCase())
  const byClient = ctx.clientType === 'PRIVATE' && find('CLIENT', ctx.clientName)
  if (byClient) return { saleUnit: byClient.saleUnit, saleCurrency: byClient.saleCurrency, source: `cliente ${byClient.scope}` }
  const byDiv = ctx.clientType === 'CFE' && find('CFE_DIVISION', ctx.division)
  if (byDiv) return { saleUnit: byDiv.saleUnit, saleCurrency: byDiv.saleCurrency, source: `división ${byDiv.scope}` }
  const byState = ctx.clientType === 'PRIVATE' && find('STATE', ctx.state)
  if (byState) return { saleUnit: byState.saleUnit, saleCurrency: byState.saleCurrency, source: `estado ${byState.scope}` }
  return { saleUnit: concept.saleUnit, saleCurrency: concept.saleCurrency, source: 'precio base' }
}
