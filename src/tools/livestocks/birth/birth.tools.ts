import { BirthField } from '../../../enums/cruds/birthFields.enum'
import { OpenAITool } from '../../../types/openai-types'

export const birthTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAnimalBirthRegistration',
      description: `DISPARADOR (INTENÇÃO):
- SEMPRE use esta ferramenta quando o usuário mencionar lançar/cadastrar/registrar nascimento/parto/parição de animal(is).
- Se houver dados na própria frase (ex.: quantidade, gênero/sexo, categoria, área, retiro, data), preencha esses campos e envie junto.
- Se não houver dados explícitos, chame com arguments = {} apenas.
- NÃO faça perguntas nesta etapa; o fluxo interno cuidará da coleta dos dados.

QUANDO NÃO USAR:
- Alterar campo em andamento → changeAnimalBirthRegistrationField.
- Confirmar → confirmAnimalBirthRegistration.
- Cancelar → cancelAnimalBirthRegistration.
- Consultas/estatísticas → não usar esta função.

EXEMPLOS:
- “Quero registrar 2 nascimentos de machos hoje na área 1” → startAnimalBirthRegistration({ quantity: 2, gender: "macho", birthDate: "<YYYY-MM-DD de hoje>", area: "Área 1" })
- “Teve parto de 3 fêmeas na categoria novilha no retiro 4 em 15/03/2024” → startAnimalBirthRegistration({ quantity: 3, gender: "fêmea", category: "novilha", retreat: "Retiro 4", birthDate: "2024-03-15" })
- “Quero lançar um nascimento” → startAnimalBirthRegistration({})`,
      parameters: {
        type: 'object',
        properties: {
          quantity: { type: ['integer', 'null'], minimum: 1 },
          birthDate: { type: 'string', format: 'date' },
          gender: { type: ['string', 'null'] },
          category: { type: ['string', 'null'] },
          retreat: { type: ['string', 'null'] },
          area: { type: ['string', 'null'] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'changeAnimalBirthRegistrationField',
      description:
        'Altera um campo específico no CADASTRO DE NASCIMENTO em andamento. Use quando o usuário disser algo como “trocar categoria”, “mudar gênero”, “alterar área”, ou similar. Esta ferramenta reenvia o menu adequado (data, gênero, categoria, área, retiro) para nova escolha e, após a seleção, o sistema volta a exibir o RESUMO para confirmação.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [BirthField.BirthDate, BirthField.Quantity, BirthField.Category, BirthField.Retreat, BirthField.Area],
            description: 'Campo que o usuário deseja alterar (Data de nascimento, Quantidade, Gênero, Categoria, Retiro, Área).',
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
      name: 'confirmAnimalBirthRegistration',
      description: 'Confirma o cadastro de nascimento usando o rascunho atual. Use quando o usuário disser claramente que deseja confirmar.',
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
      name: 'cancelAnimalBirthRegistration',
      description: 'Cancela e limpa o rascunho atual do cadastro de nascimento. Use quando o usuário disser para cancelar ou desistir.',
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
      name: 'editBirthRecordField',
      description: `Edita um campo específico de um registro de nascimento já criado (não um rascunho em andamento).

QUANDO USAR:
- Após confirmar um nascimento, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Editar" ou solicitar edição de um campo específico
- Use esta função para modificar: Data de Nascimento, Quantidade, Categoria, Retiro ou Área

EXEMPLOS:
- "Alterar data de nascimento para 20/03/2024" → editBirthRecordField({ field: "birthDate", value: "2024-03-20" })
- "Mudar quantidade para 5" → editBirthRecordField({ field: "quantity", value: 5 })
- "Trocar categoria" → editBirthRecordField({ field: "category", value: "novilha" })

NÃO USAR para rascunhos em andamento (use changeAnimalBirthRegistrationField)`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [BirthField.BirthDate, BirthField.Quantity, BirthField.Category, BirthField.Retreat, BirthField.Area],
            description: 'Campo a ser editado no registro existente',
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
      name: 'deleteBirthRegistration',
      description: `Exclui um registro de nascimento já criado.

QUANDO USAR:
- Após confirmar um nascimento, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Excluir" ou solicitar exclusão do registro
- Requer confirmação antes de executar

EXEMPLOS:
- Usuário clica em "Excluir" → deleteBirthRegistration({ confirmation: false }) (pedir confirmação)
- Usuário confirma exclusão → deleteBirthRegistration({ confirmation: true })

IMPORTANTE: Sempre peça confirmação antes de excluir`,
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
