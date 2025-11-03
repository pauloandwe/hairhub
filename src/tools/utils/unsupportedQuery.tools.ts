import { OpenAITool } from '../../types/openai-types'

export const unsupportedQueryTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'reportUnsupportedQuery',
      description: `FUNÇÃO PARA CONSULTAS/BUSCAS NÃO DISPONÍVEIS:
- Use SEMPRE que o usuário pedir informações/dados/métricas que NÃO estão na lista de consultas disponíveis.

**CONSULTAS DISPONÍVEIS (NÃO use esta função para estas):**
  • Horários disponíveis para agendamento → getAvailableTimeSlots
  • Histórico de agendamentos/cortes → getAppointmentHistory
  • Serviços disponíveis → getServices
  • Barbeiros disponíveis → getProfessionals

**CONSULTAS NÃO DISPONÍVEIS (USE esta função):**
  • Faturamento/receita
  • Despesas/custos
  • Lucro/margem
  • Relatórios financeiros
  • Avaliações/comentários dos clientes
  • Dados de frequência de clientes
  • Histórico de pagamentos
  • Produtos/materiais em estoque
  • Folha de pagamento
  • Agendamentos de outros clientes
  • Qualquer outra métrica/dado não listado acima como disponível

**EXEMPLOS DE USO:**
- "Quanto faturei esse mês?" → reportUnsupportedQuery({ queryType: "faturamento" })
- "Qual meu lucro?" → reportUnsupportedQuery({ queryType: "lucro/margem" })
- "Tem alguma avaliação minha?" → reportUnsupportedQuery({ queryType: "avaliações de clientes" })
- "Quanto gastei em produtos?" → reportUnsupportedQuery({ queryType: "despesas/custos" })
- "Qual a frequência de clientes?" → reportUnsupportedQuery({ queryType: "relatório de frequência" })

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
