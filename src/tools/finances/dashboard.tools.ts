import { OpenAITool } from '../../types/openai-types'

export const dashboardTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'getTotalDisbursementByPeriod',
      description:
        "Obtém o total de desembolsos para qualquer período específico. Permite filtrar por datas de início e fim (startDate e endDate) e também por safra. Use esta função para consultar desembolsos em intervalos específicos de datas. Se o usuário não especificar uma safra ou mencionar 'safra atual', omita o parâmetro harvest para usar a safra padrão do sistema.",
      parameters: {
        type: 'object',
        properties: {
          harvest: {
            type: 'string',
            description: "Safra filtrada no formato YYYY/YYYY (opcional). IMPORTANTE: Se o usuário mencionar 'safra atual', 'safra corrente', ou similar, NÃO envie este parâmetro - deixe vazio para que o sistema use automaticamente a safra atual.",
          },
          startDate: {
            type: 'string',
            description: 'Data de início do período para consulta no formato YYYY-MM-DD. Use para definir a data inicial do intervalo de desembolsos (opcional).',
          },
          endDate: {
            type: 'string',
            description: 'Data de fim do período para consulta no formato YYYY-MM-DD. Use para definir a data final do intervalo de desembolsos (opcional).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentMonthDisbursement',
      description:
        "Obtém automaticamente o total de desembolsos do mês atual. Calcula as datas de início e fim do mês automaticamente e retorna o desembolso total do período. Se o usuário não especificar uma safra ou mencionar 'safra atual', omita o parâmetro harvest para usar a safra padrão do sistema.",
      parameters: {
        type: 'object',
        properties: {
          harvest: {
            type: 'string',
            description: "Safra no formato YYYY/YYYY (opcional). IMPORTANTE: Se o usuário mencionar 'safra atual', 'safra corrente', ou similar, NÃO envie este parâmetro - deixe vazio para que o sistema use automaticamente a safra atual.",
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPreviousCropDisbursement',
      description:
        "Obtém automaticamente o desembolso total da safra passada/anterior. Calcula automaticamente o período da safra anterior (01/07 a 30/06) e retorna o total de desembolsos. Use esta função quando o usuário perguntar sobre 'desembolso da safra passada', 'safra anterior', ou similar, sem especificar datas.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentCropDisbursement',
      description:
        "Obtém automaticamente o desembolso total da safra atual/corrente. Calcula automaticamente o período da safra atual (01/07 a 30/06) e retorna o total de desembolsos. Use esta função quando o usuário perguntar sobre 'desembolso da safra atual', 'safra corrente', 'safra em andamento', ou similar, sem especificar datas.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]
