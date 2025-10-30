import { PurchaseField } from '../../../services/livestocks/Purchase/purchase.types'
import { OpenAITool } from '../../../types/openai-types'

export const purchaseTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startPurchaseRegistration',
      description: `DISPARADOR (INTENÇÃO):
- SEMPRE use esta ferramenta quando o usuário mencionar lançar/cadastrar/registrar compra de animal(is).
- Se a frase já trouxer dados (ex.: data da compra, quantidade, peso, valor unitário/total, categoria, área, retiro, data, observação), preencha esses campos e envie junto.
- Se não houver dados explícitos, chame com arguments = {} apenas.
- NÃO faça perguntas nesta etapa; o fluxo interno cuidará da coleta dos dados.

QUANDO NÃO USAR:
- Alterar campo em andamento → changePurchaseRegistrationField.
- Confirmar → confirmPurchaseRegistration.
- Cancelar → cancelPurchaseRegistration.
- Consultas/estatísticas → não usar esta função.

EXEMPLOS:
- “Quero lançar a compra de 10 animais hoje na área 2” → startPurchaseRegistration({ quantity: 10, saleDate: "<YYYY-MM-DD de hoje>", area: "Área 2" })
- “Registrar compra de 5 novilhas, retiro 3, valor total 25 mil em 15/03/2024” → startPurchaseRegistration({ quantity: 5, category: "novilha", retreat: "Retiro 3", totalValue: 25000, saleDate: "2024-03-15" })
- “Preciso cadastrar uma compra” → startPurchaseRegistration({})`,
      parameters: {
        type: 'object',
        properties: {
          saleDate: { type: 'string', format: 'date' },
          quantity: { type: ['integer', 'null'], minimum: 1 },
          weight: { type: ['number', 'null'], minimum: 1 },
          unityValue: { type: ['number', 'null'], minimum: 0 },
          totalValue: { type: ['number', 'null'], minimum: 0 },
          observation: { type: ['string', 'null'] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'changePurchaseRegistrationField',
      description:
        'Altera um campo específico no CADASTRO DE COMPRA em andamento. Use quando o usuário disser algo como “mudar a quantidade”, “alterar o retiro”, ou similar. Esta ferramenta reenvia o menu adequado para nova escolha e, após a seleção, o sistema volta a exibir o RESUMO para confirmação.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [PurchaseField.SaleDate, PurchaseField.Weight, PurchaseField.Quantity, PurchaseField.UnityValue, PurchaseField.TotalValue, PurchaseField.Category, PurchaseField.Retreat, PurchaseField.Area, PurchaseField.Observation],
            description: 'Campo que o usuário deseja alterar (Data de compra, Peso, Quantidade, Valores, Categoria, Retiro, Área, Observação).',
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
      name: 'confirmPurchaseRegistration',
      description: 'Confirma o cadastro de compra usando o rascunho atual. Use quando o usuário disser claramente que deseja confirmar.',
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
      name: 'cancelPurchaseRegistration',
      description: 'Cancela e limpa o rascunho atual do cadastro de compra. Use quando o usuário disser para cancelar ou desistir.',
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
      name: 'editPurchaseRecordField',
      description: `Edita um campo específico de um registro de compra já criado (não um rascunho em andamento).

QUANDO USAR:
- Após confirmar uma compra, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Editar" ou solicitar edição de um campo específico
- Use esta função para modificar: Data de compra, Peso, Quantidade, Valores, Categoria, Retiro, Área ou Observação

EXEMPLOS:
- "Alterar data da compra para 20/03/2024" → editPurchaseRecordField({ field: "saleDate", value: "2024-03-20" })
- "Mudar quantidade para 12" → editPurchaseRecordField({ field: "quantity", value: 12 })
- "Atualizar observação" → editPurchaseRecordField({ field: "observation", value: "Compra entregue pela manhã" })

NÃO USAR para rascunhos em andamento (use changePurchaseRegistrationField)`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [PurchaseField.SaleDate, PurchaseField.Weight, PurchaseField.Quantity, PurchaseField.UnityValue, PurchaseField.TotalValue, PurchaseField.Category, PurchaseField.Retreat, PurchaseField.Area, PurchaseField.Observation],
            description: 'Campo a ser editado no registro existente.',
          },
          value: {
            type: ['string', 'number', 'null'],
            description: 'Novo valor para o campo (adaptado automaticamente ao tipo esperado).',
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
      name: 'deletePurchaseRegistration',
      description: `Exclui um registro de compra já criado.

QUANDO USAR:
- Após confirmar uma compra, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Excluir" ou solicitar exclusão do registro
- Requer confirmação antes de executar

EXEMPLOS:
- Usuário clica em "Excluir" → deletePurchaseRegistration({ confirmation: false }) (pedir confirmação)
- Usuário confirma exclusão → deletePurchaseRegistration({ confirmation: true })

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
