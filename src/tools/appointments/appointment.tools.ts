import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { OpenAITool } from '../../types/openai-types'

export const appointmentTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAppointmentRegistration',
      description: `DISPARADOR (INTENÇÃO):
- SEMPRE use esta ferramenta quando o usuário mencionar agendar/marcar/fazer agendamento/corte/serviço de barbearia.
- Se houver dados na própria frase (ex.: data, horário, serviço, barbeiro, nome), preencha esses campos e envie junto.
- Se não houver dados explícitos, chame com arguments = {} apenas.
- NÃO faça perguntas nesta etapa; o fluxo interno cuidará da coleta dos dados.

QUANDO NÃO USAR:
- Alterar campo em andamento → changeAppointmentRegistrationField.
- Confirmar → confirmAppointmentRegistration.
- Cancelar → cancelAppointmentRegistration.
- Consultas/buscas → não usar esta função.

EXEMPLOS:
- "Quero agendar um corte para amanhã" → startAppointmentRegistration({ date: "<YYYY-MM-DD de amanhã>" })
- "Agendar corte + barba com João para 15/11/2024 às 14:00" → startAppointmentRegistration({ date: "2024-11-15", time: "14:00", service: "Corte + Barba", barber: "João" })
- "Quero fazer um agendamento" → startAppointmentRegistration({})`,
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          time: { type: ['string', 'null'] },
          service: { type: ['string', 'null'] },
          barber: { type: ['string', 'null'] },
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
      name: 'changeAppointmentRegistrationField',
      description:
        'Altera um campo específico no CADASTRO DE AGENDAMENTO em andamento. Use quando o usuário disser algo como "mudar de barbeiro", "trocar a data", "alterar horário", ou similar. Esta ferramenta reenvia o menu adequado para nova escolha e, após a seleção, o sistema volta a exibir o RESUMO para confirmação.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [AppointmentFields.DATE, AppointmentFields.TIME, AppointmentFields.SERVICE, AppointmentFields.BARBER, AppointmentFields.CLIENT_NAME, AppointmentFields.CLIENT_PHONE, AppointmentFields.NOTES],
            description: 'Campo que o usuário deseja alterar (Data, Horário, Serviço, Barbeiro, Nome, Telefone, Observações).',
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
      name: 'confirmAppointmentRegistration',
      description: 'Confirma o agendamento usando o rascunho atual. Use quando o usuário disser claramente que deseja confirmar.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelAppointmentRegistration',
      description: 'Cancela e limpa o rascunho atual do agendamento. Use quando o usuário disser para cancelar ou desistir.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editAppointmentRecordField',
      description: `Edita um campo específico de um agendamento já criado (não um rascunho em andamento).

QUANDO USAR:
- Após confirmar um agendamento, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Editar" ou solicitar edição de um campo específico
- Use esta função para modificar: Data, Horário, Serviço, Barbeiro, Nome, Telefone ou Observações

EXEMPLOS:
- "Alterar data para 20/11/2024" → editAppointmentRecordField({ field: "date", value: "2024-11-20" })
- "Mudar de barbeiro para Carlos" → editAppointmentRecordField({ field: "barber", value: "Carlos" })
- "Trocar horário para 15:30" → editAppointmentRecordField({ field: "time", value: "15:30" })

NÃO USAR para rascunhos em andamento (use changeAppointmentRegistrationField)`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [AppointmentFields.DATE, AppointmentFields.TIME, AppointmentFields.SERVICE, AppointmentFields.BARBER, AppointmentFields.CLIENT_NAME, AppointmentFields.CLIENT_PHONE, AppointmentFields.NOTES],
            description: 'Campo a ser editado no agendamento existente',
          },
          value: {
            type: ['string', 'number', 'null'],
            description: 'Novo valor para o campo (adaptado automaticamente ao tipo esperado)',
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
      name: 'deleteAppointmentRegistration',
      description: `Exclui um agendamento já criado.

QUANDO USAR:
- Após confirmar um agendamento, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Excluir" ou solicitar exclusão do agendamento
- Requer confirmação antes de executar

EXEMPLOS:
- Usuário clica em "Excluir" → deleteAppointmentRegistration({})
- Sempre peça confirmação antes de excluir`,
      parameters: {
        type: 'object',
        properties: {
          confirmation: {
            type: 'boolean',
            description: 'true = confirma exclusão, false ou ausente = pedir confirmação',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
]
