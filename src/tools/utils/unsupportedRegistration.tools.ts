import { OpenAITool } from '../../types/openai-types'

export const unsupportedRegistrationTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'reportUnsupportedRegistration',
      description: `FUNÇÃO PARA CADASTROS NÃO DISPONÍVEIS:
- Use SEMPRE que o usuário mencionar cadastrar/lançar/registrar algo que NÃO está na lista de cadastros disponíveis.
- Cadastros DISPONÍVEIS (NÃO use esta função para estes):
  * Morte/óbito/baixa de animais → usar startAnimalDeathRegistration
  * Despesas/custos/gastos → usar startExpenseRegistration
  * Nascimentos/partos/parições de animais → usar startAnimalBirthRegistration

- Cadastros NÃO DISPONÍVEIS (USE esta função):
  * Venda de animais
  * Compra de animais
  * Produção de leite
  * Pesagem
  * Vacinação
  * Movimentação de lote
  * Safra/plantio
  * Receitas/vendas
  * Qualquer outro tipo de cadastro não listado acima como disponível

EXEMPLOS DE USO:
- "Quero cadastrar uma venda" → reportUnsupportedRegistration({ registrationType: "venda de animais" })
- "Lançar produção de leite" → reportUnsupportedRegistration({ registrationType: "produção de leite" })

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
