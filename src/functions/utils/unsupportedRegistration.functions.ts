export const unsupportedRegistrationFunctions = {
  reportUnsupportedRegistration: async (args: { registrationType: string; phone?: string }) => {
    const { registrationType } = args

    return {
      success: false,
      message: `Poxa, no momento eu ainda não consigo te ajudar com "${registrationType}" por aqui.

Mas posso continuar te ajudando com agendamentos, como marcar um horário, remarcar, consultar horários disponíveis, ver seus agendamentos e mostrar os serviços disponíveis.

Se quiser, me diga o que você precisa e eu sigo com você da melhor forma.`,
      availableRegistrations: ['agendamento', 'remarcação', 'consulta de horários', 'consulta de serviços'],
      requestedType: registrationType,
    }
  },
}
