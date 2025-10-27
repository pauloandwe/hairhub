import { OpenAITool } from '../../types/openai-types'

export const appointmentQueryTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'getAvailableTimeSlots',
      description: `Retorna os horários disponíveis para agendamento em um determinado dia.

QUANDO USAR:
- Quando o usuário pergunta "Quais horários tem disponível?"
- Quando o usuário quer saber "Qual melhor horário para agendar?"
- Durante o fluxo de agendamento para mostrar opções de horários

EXEMPLOS:
- "Quais horários estão livres amanhã?" → getAvailableTimeSlots({ date: "<YYYY-MM-DD de amanhã>" })
- "Tem horário com o João disponível?" → getAvailableTimeSlots({ barberId: 1 })
- "Me mostra os horários para 20/11/2024" → getAvailableTimeSlots({ date: "2024-11-20" })`,
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date', description: 'Data para consultar horários (YYYY-MM-DD)' },
          barberId: { type: 'integer', description: 'ID do barbeiro (opcional)' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAppointmentHistory',
      description: `Retorna o histórico de agendamentos do cliente.

QUANDO USAR:
- Quando o usuário pergunta "Quais agendamentos eu tenho?"
- Quando o usuário quer consultar seus cortes anteriores
- Para mostrar histórico de visitas

EXEMPLOS:
- "Qual foi meu último corte?" → getAppointmentHistory({})
- "Me mostra meu histórico de agendamentos" → getAppointmentHistory({ limit: 10 })`,
      parameters: {
        type: 'object',
        properties: {
          clientPhone: { type: 'string', description: 'Telefone do cliente (opcional)' },
          limit: { type: 'integer', description: 'Número máximo de registros a retornar (padrão: 10)' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getServices',
      description: `Retorna os serviços disponíveis na barbearia.

QUANDO USAR:
- Quando o usuário pergunta "Quais serviços vocês oferecem?"
- Quando o usuário quer ver as opções de corte
- Para listar preços e duração dos serviços

EXEMPLOS:
- "Que tipos de corte vocês têm?" → getServices({})
- "Quanto custa um corte?" → getServices({})
- "Qual a diferença entre os serviços?" → getServices({})`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBarbers',
      description: `Retorna os barbeiros disponíveis na barbearia.

QUANDO USAR:
- Quando o usuário pergunta "Quem são os barbeiros?"
- Quando o usuário quer escolher um barbeiro específico
- Para mostrar especialidades de cada barbeiro

EXEMPLOS:
- "Quem atende?" → getBarbers({})
- "Qual barbeiro é melhor para corte moderno?" → getBarbers({})
- "O João trabalha hoje?" → getBarbers({})`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
]
