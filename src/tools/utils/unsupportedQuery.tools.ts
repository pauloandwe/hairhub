import { OpenAITool } from '../../types/openai-types'

export const unsupportedQueryTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'reportUnsupportedQuery',
      description: `FUNÇÃO PARA CONSULTAS/BUSCAS NÃO DISPONÍVEIS:
- Use SEMPRE que o usuário pedir informações/dados/métricas que NÃO estão na lista de consultas disponíveis.

**CONSULTAS DISPONÍVEIS (NÃO use esta função para estas):**
  • Desembolsos/gastos (total por período, mês atual, safra atual/anterior) → getTotalDisbursementByPeriod, getCurrentMonthDisbursement, etc.
  • Precipitação/chuva acumulada (safra atual/anterior/específica) → getCurrentCropWeatherAccumulated, etc.
  • Rebanho atual/quantidade de animais na fazenda → getCurrentHerd
  • Quantidade de animais em lote específico → getAnimalQuantity

**CONSULTAS NÃO DISPONÍVEIS (USE esta função):**
  • GMD (Ganho Médio Diário)
  • Produção de leite
  • Nascimentos/natalidade
  • Pesagens/peso dos animais
  • Vacinações
  • Taxa de mortalidade
  • Vendas realizadas
  • Compras realizadas
  • Movimentações de lote
  • Índices zootécnicos (conversão alimentar, lotação, etc.)
  • Receitas/faturamento
  • Lucro/margem
  • Estoque de produtos
  • Relatórios de safra detalhados
  • Qualquer outra métrica/dado não listado acima como disponível

**EXEMPLOS DE USO:**
- "Qual meu GMD?" → reportUnsupportedQuery({ queryType: "GMD (Ganho Médio Diário)" })
- "Quanto produzi de leite esse mês?" → reportUnsupportedQuery({ queryType: "produção de leite" })
- "Quantos animais nasceram?" → reportUnsupportedQuery({ queryType: "nascimentos" })
- "Qual a taxa de mortalidade?" → reportUnsupportedQuery({ queryType: "taxa de mortalidade" })
- "Quanto recebi de vendas?" → reportUnsupportedQuery({ queryType: "receitas/vendas" })

IMPORTANTE: Esta função informa ao usuário que a consulta solicitada não está disponível no sistema.`,
      parameters: {
        type: 'object',
        properties: {
          queryType: {
            type: 'string',
            description: 'O tipo de consulta/busca/métrica que o usuário está solicitando (ex: "GMD", "produção de leite", "nascimentos", "taxa de mortalidade")',
          },
        },
        required: ['queryType'],
        additionalProperties: false,
      },
    },
  },
]
