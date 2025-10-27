import { OpenAITool } from '../../types/openai-types'

export const unsupportedRegistrationTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'reportUnsupportedRegistration',
      description: `FUNÇÃO PARA CADASTROS NÃO DISPONÍVEIS:
- Use SEMPRE que o usuário mencionar cadastrar/lançar/registrar algo que NÃO está na lista de cadastros disponíveis.
- Cadastros DISPONÍVEIS (NÃO use esta função para estes):
  * Agendamento de corte/serviço → usar startAppointmentRegistration
  * Despesas/custos/gastos da barbearia → usar startExpenseRegistration

- Cadastros NÃO DISPONÍVEIS (USE esta função):
  * Cadastro de novos barbeiros
  * Cadastro de novos serviços
  * Cadastro de clientes
  * Registro de pagamentos
  * Cadastro de fornecedores
  * Registro de faturamento
  * Cadastro de produtos/estoque
  * Mudança de preços
  * Qualquer outro tipo de cadastro não listado acima como disponível

EXEMPLOS DE USO:
- "Quero adicionar um novo barbeiro" → reportUnsupportedRegistration({ registrationType: "cadastro de novo barbeiro" })
- "Registrar um novo serviço" → reportUnsupportedRegistration({ registrationType: "cadastro de novo serviço" })
- "Cadastrar um novo cliente" → reportUnsupportedRegistration({ registrationType: "cadastro de cliente" })

IMPORTANTE: Esta função informa ao usuário que o cadastro solicitado não está disponível no sistema.`,
      parameters: {
        type: 'object',
        properties: {
          registrationType: {
            type: 'string',
            description: 'O tipo de cadastro/lançamento que o usuário está solicitando (ex: "venda de animais", "produção de leite")',
          },
        },
        required: ['registrationType'],
        additionalProperties: false,
      },
    },
  },
]
