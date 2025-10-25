export const unsupportedRegistrationFunctions = {
  reportUnsupportedRegistration: async (args: { registrationType: string; phone?: string }) => {
    const { registrationType } = args

    return {
      success: false,
      message: `Desculpe, mas o cadastro de "${registrationType}" ainda não está disponível no sistema.

Atualmente, você pode fazer os seguintes cadastros:
• Morte/baixa de animais
• Despesas/custos
• Nascimento/parto/parição de animais

Estamos trabalhando para adicionar mais funcionalidades em breve! Se precisar de ajuda com algum dos cadastros disponíveis, é só me avisar.`,
      availableRegistrations: ['morte de animais', 'despesas'],
      requestedType: registrationType,
    }
  },
}
