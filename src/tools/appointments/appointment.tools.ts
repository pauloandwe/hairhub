import { OpenAITool } from '../../types/openai-types'

export const appointmentTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAppointmentCreation',
      description:
        'Inicia o fluxo de criação de um novo agendamento. Use quando o cliente expressar desejo de marcar um horário (ex: "quero marcar", "agendar", "fazer agendamento").',
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
      name: 'setAppointmentService',
      description: 'Define o serviço desejado para o agendamento. Use quando o cliente escolher um serviço.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
          serviceName: {
            type: 'string',
            description: 'Nome do serviço escolhido (ex: "corte", "barba", "corte + barba")',
          },
        },
        required: ['phone', 'serviceName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'setAppointmentBarber',
      description: 'Define o barbeiro para o agendamento. Use quando o cliente escolher um barbeiro específico ou disser "qualquer um".',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
          barberName: {
            type: 'string',
            description: 'Nome do barbeiro escolhido ou "qualquer um" se não tiver preferência',
          },
        },
        required: ['phone', 'barberName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'setAppointmentDate',
      description: 'Define a data do agendamento. Use quando o cliente informar uma data.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
          date: {
            type: 'string',
            description: 'Data do agendamento no formato YYYY-MM-DD',
          },
        },
        required: ['phone', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'setAppointmentTime',
      description: 'Define o horário do agendamento. Use quando o cliente escolher um horário disponível.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone do cliente',
          },
          time: {
            type: 'string',
            description: 'Horário no formato HH:mm (ex: "14:00", "09:30")',
          },
        },
        required: ['phone', 'time'],
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
          customerName: {
            type: 'string',
            description: 'Nome do cliente (opcional)',
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
]
