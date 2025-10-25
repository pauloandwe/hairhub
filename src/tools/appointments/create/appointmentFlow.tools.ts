import { OpenAITool } from '../../../types/openai-types'

export const appointmentFlowTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAppointmentCreation',
      description: 'Inicia o fluxo de criação de um novo agendamento. Use quando o cliente expressar desejo de marcar um horário (ex: "quero marcar", "agendar", "fazer agendamento").',
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
      name: 'continueAppointmentCreation',
      description: 'Continua o fluxo de agendamento. Use quando o cliente fornecer informações durante o processo.',
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
      name: 'confirmAppointmentCreation',
      description: 'Confirma e cria o agendamento. Use quando o cliente confirmar o agendamento dizendo "sim", "confirmar", "ok".',
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
      name: 'cancelAppointmentCreation',
      description: 'Cancela o fluxo de criação de agendamento. Use quando o cliente desistir ou cancelar o processo.',
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
      name: 'changeAppointmentField',
      description: 'Altera um campo específico do agendamento. Use quando o cliente quiser mudar algo já informado (ex: "mudar data", "outro barbeiro").',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
          field: {
            type: 'string',
            enum: ['service', 'barber', 'date', 'time', 'notes'],
            description: 'Campo a ser alterado',
          },
          value: {
            type: 'string',
            description: 'Novo valor para o campo (opcional, será perguntado se não informado)',
          },
        },
        required: ['phone', 'field'],
      },
    },
  },
]
