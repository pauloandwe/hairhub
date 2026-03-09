import { OpenAITool } from '../../types/openai-types'

export const appointmentCancellationTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAppointmentCancellation',
      description: `Inicia o fluxo de cancelamento de um agendamento já criado.

QUANDO USAR:
- Quando o usuário disser "cancelar horário", "desmarcar", "cancelar meu agendamento" ou algo equivalente.
- Use quando não houver um fluxo ativo de criação/remarcação sendo cancelado.

EXEMPLOS:
- "Quero cancelar meu horário" → startAppointmentCancellation({})
- "Desmarca meu corte de amanhã" → startAppointmentCancellation({})
- "Preciso cancelar meu agendamento" → startAppointmentCancellation({})`,
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
      name: 'changeAppointmentCancellationField',
      description: `Altera o agendamento selecionado durante o fluxo de cancelamento.

QUANDO USAR:
- Quando o usuário quiser escolher outro agendamento para cancelar.

EXEMPLOS:
- "Quero cancelar o outro horário" → changeAppointmentCancellationField({ field: "appointmentId" })`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['appointmentId'],
            description: 'Campo do fluxo de cancelamento a ser alterado.',
          },
          value: {
            description: 'ID do agendamento selecionado, quando já estiver disponível.',
          },
        },
        required: ['field'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmAppointmentCancellation',
      description: `Confirma o cancelamento do agendamento selecionado.

QUANDO USAR:
- Quando o usuário confirmar claramente que deseja cancelar o horário.

EXEMPLOS:
- "Pode cancelar" → confirmAppointmentCancellation({})
- "Confirma" → confirmAppointmentCancellation({})`,
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
      name: 'cancelAppointmentCancellation',
      description: `Interrompe o fluxo de cancelamento em andamento.

QUANDO USAR:
- Quando o usuário desistir do cancelamento antes da confirmação final.

EXEMPLOS:
- "Deixa pra lá" → cancelAppointmentCancellation({})
- "Não quero mais cancelar" → cancelAppointmentCancellation({})`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
]
