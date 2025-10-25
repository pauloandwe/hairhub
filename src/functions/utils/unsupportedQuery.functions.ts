export const unsupportedQueryFunctions = {
  reportUnsupportedQuery: async (args: { queryType: string; phone?: string }) => {
    const { queryType } = args

    return {
      success: false,
      message: `Desculpe, mas a consulta sobre "${queryType}" ainda não está disponível no sistema.

Atualmente, você pode consultar:
• Desembolsos/gastos (total por período, mês atual, safra)
• Precipitação/chuva acumulada (safra atual/anterior)
• Rebanho atual (quantidade total de animais)
• Quantidade de animais por lote

Estamos trabalhando para adicionar mais relatórios e métricas em breve! Se precisar de ajuda com alguma das consultas disponíveis, é só me avisar.`,
      availableQueries: ['desembolsos por período/safra', 'precipitação acumulada', 'rebanho atual', 'quantidade de animais por lote'],
      requestedQuery: queryType,
    }
  },
}
