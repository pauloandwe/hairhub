import { OpenAITool } from '../../types/openai-types'

export const appointmentQueriesTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'getMyAppointments',
      description: 'Busca todos os agendamentos do cliente. Use quando o cliente perguntar sobre seus agendamentos.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getNextAppointmentInfo',
      description:
        'Busca o próximo agendamento futuro do cliente. Use quando o cliente perguntar "quando é meu horário", "qual meu próximo agendamento".',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getUpcomingAppointmentsInfo',
      description: 'Busca os próximos agendamentos futuros do cliente.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
          limit: {
            type: 'number',
            description: 'Número máximo de agendamentos a retornar (padrão: 5)',
          },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAvailableSlotsInfo',
      description:
        'Busca horários disponíveis para uma data específica. Use quando o cliente perguntar sobre disponibilidade de horários.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
          date: {
            type: 'string',
            description: 'Data para verificar disponibilidade (formato YYYY-MM-DD)',
          },
          serviceId: {
            type: 'string',
            description: 'ID do serviço (opcional)',
          },
          barberId: {
            type: 'string',
            description: 'ID do barbeiro específico (opcional)',
          },
        },
        required: ['phone', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getServices',
      description: 'Lista todos os serviços disponíveis. Use quando o cliente perguntar quais serviços são oferecidos.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBarbers',
      description: 'Lista todos os barbeiros disponíveis. Use quando o cliente perguntar quem são os barbeiros.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
        },
        required: ['phone'],
      },
    },
  },
]
