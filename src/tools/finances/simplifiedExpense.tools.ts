import { SimplifiedExpenseField } from '../../enums/cruds/simplifiedExpenseFields.enums'
import { OpenAITool } from '../../types/openai-types'

export const expenseTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startExpenseRegistration',
      description: 'Inicia o registro de uma nova despesa. Use quando o usuário quiser lançar, cadastrar ou registrar um novo custo ou gasto. Extraia qualquer dado já informado (valor, data, etc.) para os parâmetros.',
      parameters: {
        type: 'object',
        properties: {
          emissionDate: {
            type: 'string',
            description: 'A data em que a despesa ocorreu (formato DD/MM/YYYY). Ex: "ontem", "hoje", "15/03/2025".',
          },
          supplierId: {
            type: 'string',
            description: 'O ID do fornecedor, se o usuário mencionar um nome conhecido.',
          },
          description: {
            type: 'string',
            description: 'Uma breve descrição da despesa. Ex: "compra de ração", "vacinas".',
          },
          value: {
            type: 'number',
            description: 'O valor monetário da despesa.',
          },
          dueDate: {
            type: 'string',
            description: 'A data de vencimento para pagamento (formato DD/MM/YYYY).',
          },
          paymentDate: {
            type: 'string',
            description: 'A data em que o pagamento foi ou será feito (formato DD/MM/YYYY).',
          },
          paymentMethod: {
            type: 'string',
            description: 'O método de pagamento. Ex: "pix", "cartão de crédito".',
          },
          businessArea: {
            type: 'string',
            description: 'A área de negócio associada. Ex: "gado de corte", "safra de soja".',
          },
          productServiceName: {
            type: 'string',
            description: 'O nome do produto ou serviço adquirido. Pode ser qualquer coisa que o usuário mencionar como gasto. Ex: "ração", "vacina", "consulta veterinária".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'changeSimplifiedExpenseRegistration',
      description:
        "Modifica um campo específico do rascunho de despesa atual. Use SEMPRE que o usuário pedir para 'alterar', 'corrigir' ou 'mudar' uma informação já fornecida. **IMPORTANTE** você jamais deve assumir ou presumir nenhuma informações, extraia da mensagem qual é o campo que o usuário quer alterar e o valor se houver.",
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: Object.values(SimplifiedExpenseField),
            description: 'O nome do campo que o usuário deseja alterar.',
          },
          value: {
            type: 'string',
            description: 'O novo valor para o campo. Extraia este valor se o usuário o fornecer na mesma frase. Ex: "mudar o valor para 500"',
          },
        },
        required: ['field'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmSimpleExpenseRegistration',
      description: "Confirma e finaliza o registro da despesa atual. Use quando o usuário disser 'confirmar', 'salvar', 'finalizar', 'ok', 'certo' ou 'pode ser'.",
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
      name: 'cancelSimplifiedExpenseRegistration',
      description: "Cancela o rascunho de despesa atual. Use SEMPRE que o usuário disser 'cancelar', 'desistir', 'parar', ou 'não quero mais'.",
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
      name: 'editExpenseRecordField',
      description: `Edita um campo do registro de despesa JÁ CRIADO.

**QUANDO USAR:**
- Usuário está em modo de edição (após clicar "Editar")
- Usuário quer mudar/alterar/corrigir algum dado do registro de despesa criado

**COMPORTAMENTOS:**
- Se usuário disser "mudar valor para 500" → chame com field="value" e value=500
- Se usuário disser "alterar fornecedor" → chame apenas com field="supplier" (sem value, sistema perguntará)
- Se usuário disser "corrigir data de vencimento para 15/12/2025" → chame com field="dueDate" e value="15/12/2025"

**EXEMPLOS:**
- "Mudar valor para 500" → { field: "value", value: 500 }
- "Alterar fornecedor" → { field: "supplier" }
- "Corrigir descrição para Compra de ração" → { field: "description", value: "Compra de ração" }
- "Mudar método de pagamento" → { field: "paymentMethod" }`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['value', 'supplier', 'description', 'emissionDate', 'dueDate', 'paymentDate', 'paymentMethod', 'businessArea', 'productServiceName'],
            description: 'Campo que será editado no registro de despesa',
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
  {
    type: 'function',
    function: {
      name: 'searchCostCenter',
      description: 'Busca por centros de custo usando nome ou índice. Use quando precisar buscar um centro de custo específico para a despesa. O usuário pode informar o nome (ex: "Aveia") ou o índice (ex: "1.1.1") do centro de custo desejado.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nome ou índice do centro de custo a buscar. Ex: "Aveia", "1.1.1", "Rebanho".',
          },
        },
        required: ['query'],
      },
    },
  },
]
