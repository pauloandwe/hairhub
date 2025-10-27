import { DeathField } from '../../enums/cruds/deathFields.enums'
import { OpenAITool } from '../../types/openai-types'

export const deathTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startAnimalDeathRegistration',
      description: `DISPARADOR (INTENÇÃO):
- SEMPRE use esta ferramenta quando o usuário mencionar lançar/cadastrar/registrar/baixar morte/óbito/perda de animal(is).
- Se houver dados na própria frase (ex.: quantidade, causa, lote, área, retiro, data, idade/categoria, observação), preencha esses campos e envie junto.
- Se não houver dados explícitos, chame com arguments = {} apenas.
- NÃO faça perguntas nesta etapa; o fluxo interno cuidará da coleta do que faltar.

QUANDO NÃO USAR:
- Alterar campo em andamento → changeAnimalDeathRegistrationField.
- Confirmar → confirmAnimalDeathRegistration.
- Cancelar → cancelAnimalDeathRegistration.
- Consultas/estatísticas → não usar esta função.

EXEMPLOS:
- “Quero lançar 2 animais que morreram por CURSO” → startAnimalDeathRegistration({ quantity: 2, deathCause: "CURSO" })
- “Perdi 1 novilha na área 3 hoje” → startAnimalDeathRegistration({ quantity: 1, category: "novilha", area: "Área 3", deathDate: "<YYYY-MM-DD de hoje>" })
- “Quero lançar uma morte” → startAnimalDeathRegistration({})`,
      parameters: {
        type: 'object',
        properties: {
          quantity: { type: ['integer', 'null'], minimum: 1 },
          observation: { type: ['string', 'null'] },
          deathDate: { type: 'string', format: 'date' },
          harvestConfiguration: { type: ['string', 'null'] },
          age: { type: ['string', 'null'] },
          category: { type: ['string', 'null'] },
          deathCause: { type: ['string', 'null'] },
          animalLot: { type: ['string', 'null'] },
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
      name: 'changeAnimalDeathRegistrationField',
      description:
        "Altera um campo específico no CADASTRO DE MORTE em andamento. Use quando o usuário disser algo como 'trocar categoria', 'mudar causa', 'alterar lote', ou similar. Esta ferramenta reenvia o menu adequado (idade/categoria, causa de morte ou lote) para nova escolha e, após a seleção, o sistema volta a exibir o RESUMO para confirmação. Para quantidade, apenas solicita o novo número.",
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [DeathField.Quantity, DeathField.DeathDate, DeathField.Age, DeathField.Category, DeathField.DeathCause, DeathField.AnimalLot, DeathField.Retreat, DeathField.Area],
            description: 'Campo que o usuário deseja alterar (Quantidade, Data da Morte, Idade, Categoria, Causa da Morte, Lote, Retirada, Área).',
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
      name: 'confirmAnimalDeathRegistration',
      description: 'Confirma o cadastro de morte usando o rascunho atual. Use quando o usuário disser claramente que deseja confirmar.',
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
      name: 'cancelAnimalDeathRegistration',
      description: 'Cancela e limpa o rascunho atual do cadastro de morte. Use quando o usuário disser para cancelar ou desistir.',
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
      name: 'editDeathRecordField',
      description: `Edita um campo do registro de morte JÁ CRIADO.

**QUANDO USAR:**
- Usuário está em modo de edição (após clicar "Editar")
- Usuário quer mudar/alterar/corrigir algum dado do registro criado

**COMPORTAMENTOS:**
- Se usuário disser "mudar quantidade para 5" → chame com field="quantity" e value=5
- Se usuário disser "corrigir data para 2024-02-10" → chame com field="deathDate" e value="2024-02-10"
- Se usuário disser "alterar causa da morte" → chame apenas com field="deathCause" (sem value, sistema perguntará)
- Se usuário disser "corrigir lote para Lote A" → chame com field="animalLot" e value="Lote A"

**EXEMPLOS:**
- "Mudar quantidade para 5" → { field: "quantity", value: 5 }
- "Corrigir data para 2024-02-10" → { field: "deathDate", value: "2024-02-10" }
- "Alterar causa da morte" → { field: "deathCause" }
- "Corrigir categoria para bezerro" → { field: "category", value: "bezerro" }
- "Mudar área" → { field: "area" }`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['quantity', 'deathDate', 'deathCause', 'category', 'age', 'animalLot', 'retreat', 'area'],
            description: 'Campo que será editado no registro de morte',
          },
          value: {
            type: ['string', 'number', 'null'],
            description: 'Novo valor do campo (opcional - se não fornecido, o sistema perguntará)',
          },
        },
        required: ['field'],
      },
    },
  },
]
