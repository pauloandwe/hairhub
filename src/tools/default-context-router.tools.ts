import { OpenAITool } from '../types/openai-types'

export const defaultContextRouterTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAppointmentRegistration',
      description: 'Use para pedidos de marcar/agendar horário. Use intentMode="check_then_offer" apenas quando o cliente perguntar por um horário exato antes de decidir marcar.',
      parameters: {
        type: 'object',
        properties: {
          intentMode: {
            type: 'string',
            enum: ['book', 'check_then_offer'],
          },
          appointmentDate: { type: 'string' },
          appointmentTime: { type: ['string', 'null'] },
          date: { type: 'string' },
          time: { type: ['string', 'null'] },
          service: { type: ['string', 'null'] },
          professional: { type: ['string', 'null'] },
          clientName: { type: ['string', 'null'] },
          clientPhone: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'startAppointmentCancellation',
      description: 'Use para pedidos de cancelar ou desmarcar um agendamento já criado.',
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
      name: 'startAppointmentReschedule',
      description: 'Use para pedidos de remarcar, trocar data ou trocar horário de um agendamento.',
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
      name: 'getAvailableTimeSlots',
      description: 'Use para perguntas amplas sobre horários disponíveis, datas livres ou opções de agenda.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          professionalId: { type: 'integer' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getUpcomingAppointments',
      description: 'Use quando o cliente perguntar sobre o próximo horário ou agendamentos futuros.',
      parameters: {
        type: 'object',
        properties: {
          clientPhone: { type: 'string' },
          limit: { type: 'integer' },
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
      description: 'Use quando o cliente pedir histórico ou último agendamento/corte.',
      parameters: {
        type: 'object',
        properties: {
          clientPhone: { type: 'string' },
          limit: { type: 'integer' },
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
      description: 'Use quando o cliente perguntar sobre serviços, tipos de corte ou preços.',
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
      name: 'getProfessionals',
      description: 'Use quando o cliente perguntar quem atende ou quiser saber sobre profissionais/barbeiros.',
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
      name: 'reportUnsupportedRegistration',
      description: 'Use para pedidos de cadastro/registro que não sejam de agendamento.',
      parameters: {
        type: 'object',
        properties: {
          registrationType: { type: 'string' },
        },
        required: ['registrationType'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reportUnsupportedQuery',
      description: 'Use para perguntas sobre métricas, faturamento, estoque ou dados que não fazem parte do WhatsApp de agendamentos.',
      parameters: {
        type: 'object',
        properties: {
          queryType: { type: 'string' },
        },
        required: ['queryType'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replyDirectly',
      description: 'Use para cumprimento, small talk, ambiguidade real ou quando for melhor responder com uma pergunta curta.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
]
