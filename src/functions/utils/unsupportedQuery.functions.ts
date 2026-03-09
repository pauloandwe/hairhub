export const unsupportedQueryFunctions = {
  reportUnsupportedQuery: async (args: { queryType: string; phone?: string }) => {
    const { queryType } = args

    return {
      success: false,
      message: `Poxa, essa consulta sobre "${queryType}" ainda não está disponível por aqui.

Mesmo assim, posso te ajudar com o que faz parte do atendimento de agendamentos, como consultar horários disponíveis, ver seus agendamentos, mostrar os serviços e verificar os profissionais disponíveis.

Se quiser, me fala o que você precisa e eu continuo com você.`,
      availableQueries: ['horários disponíveis', 'agendamentos', 'serviços', 'profissionais'],
      requestedQuery: queryType,
    }
  },
}
