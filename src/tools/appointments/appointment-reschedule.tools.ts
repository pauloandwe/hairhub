import { OpenAITool } from '../../types/openai-types'

export const appointmentRescheduleTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAppointmentReschedule',
      description: `Inicia o fluxo de remarcação de agendamento.

QUANDO USAR:
- Quando o usuário pedir para remarcar, trocar ou alterar o horário de um agendamento.
- Sempre que o usuário mencionar "remarcar", "adiar", "trocar horário" ou algo similar.
- Use mesmo que o usuário não passe dados adicionais; o fluxo recupera os próximos agendamentos elegíveis automaticamente.

EXEMPLOS:
- "Quero remarcar meu corte" → startAppointmentReschedule({})
- "Remarca o agendamento das 14h" → startAppointmentReschedule({})
- "Trocar o horário do corte do João" → startAppointmentReschedule({})`,
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
      name: 'changeAppointmentRescheduleField',
      description: `Altera um campo durante o fluxo de remarcação de agendamento.

QUANDO USAR:
- Para mudar qual agendamento será remarquado
- Para selecionar uma nova data
- Para selecionar um novo horário

CAMPOS DISPONÍVEIS:
- appointmentId: ID do agendamento a remarcar
- newDate: Nova data; expressoes naturais como "segunda" e "proxima segunda" sao aceitas e resolvidas internamente
- newTime: Novo horário no formato HH:mm

EXEMPLOS:
- "Quer remarcar o agendamento das 14h" → changeAppointmentRescheduleField({field: 'appointmentId', value: appointmentId})
- "Prefiro próxima segunda" → changeAppointmentRescheduleField({field: 'newDate', value: 'proxima segunda'})
- "Que tal 15:30?" → changeAppointmentRescheduleField({field: 'newTime', value: '15:30'})`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['appointmentId', 'newDate', 'newTime'],
            description: 'O campo a ser alterado',
          },
          value: {
            description: 'O novo valor do campo (string ou número dependendo do campo)',
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
      name: 'confirmAppointmentReschedule',
      description: `Confirma a remarcação do agendamento com os dados selecionados.

QUANDO USAR:
- Quando houver confirmação explícita e inequívoca de que o usuário quer remarcar com a data e horário selecionados
- Após todos os campos obrigatórios (agendamento, data, hora) estarem preenchidos`,
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
      name: 'cancelAppointmentReschedule',
      description: `Cancela o fluxo em andamento de remarcação de agendamento.

QUANDO USAR:
- Quando houver desistência inequívoca durante o fluxo de remarcação.`,
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
      name: 'editAppointmentRescheduleField',
      description: `Edita um campo específico de uma remarcação após a confirmação.

QUANDO USAR:
- Para editar um campo após a remarcação ter sido confirmada
- Quando o usuário quer alterar algo que já foi marcado

CAMPOS EDITÁVEIS:
- appointmentId, newDate, newTime

EXEMPLOS:
- "Quero trocar a data" → editAppointmentRescheduleField({field: 'newDate'})
- "Muda de horário por favor" → editAppointmentRescheduleField({field: 'newTime'})`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['appointmentId', 'newDate', 'newTime'],
            description: 'O campo a ser editado',
          },
        },
        required: ['field'],
        additionalProperties: false,
      },
    },
  },
]
