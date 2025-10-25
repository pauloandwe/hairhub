import { OpenAITool } from '../../types/openai-types'

export const dateTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'getTodayDate',
      description: 'Retorna a data atual no formato YYYY-MM-DD.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentMonthPeriod',
      description: 'Retorna o período do mês atual com data de início e fim no formato YYYY-MM-DD.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculateDateFromToday',
      description: 'Calcula uma data futura ou passada a partir de hoje, adicionando ou subtraindo dias. Use números positivos para datas futuras e negativos para datas passadas.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Número de dias para adicionar (positivo) ou subtrair (negativo) da data atual. Exemplo: 7 para uma semana depois, -7 para uma semana antes.',
          },
        },
        required: ['days'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentCropYear',
      description: "Retorna informações sobre a safra atual baseada no período agrícola de 01/07 a 30/06. Use esta função quando o usuário pedir sobre 'safra atual', 'safra corrente', 'ano safra atual' ou similar. Se não especificar uma data, usa a data de hoje como referência.",
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Data de referência no formato YYYY-MM-DD para calcular a safra. Opcional - se não informado, usa a data atual.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPreviousCropYear',
      description: "Retorna informações sobre a safra anterior/passada baseada no período agrícola de 01/07 a 30/06. Use esta função quando o usuário pedir sobre 'safra passada', 'safra anterior', 'ano safra anterior' ou similar. Se não especificar uma data, usa a data de hoje como referência.",
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Data de referência no formato YYYY-MM-DD para calcular a safra anterior. Opcional - se não informado, usa a data atual.',
          },
        },
      },
    },
  },
]
