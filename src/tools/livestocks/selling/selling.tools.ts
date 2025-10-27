import { SellingField } from '../../../enums/cruds/sellingFields.enum'
import { OpenAITool } from '../../../types/openai-types'

export const sellingTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'startSaleRegistration',
      description: `DISPARADOR (INTENÇÃO):
- SEMPRE use esta ferramenta quando o usuário mencionar vender, registrar venda, lançar venda, transferir animais, ou qualquer operação de saída de animais.
- Se houver dados na própria frase (ex.: tipo de venda, data, peso, quantidade, valor unitário, categoria, área, retiro), preencha esses campos e envie junto.
- Se não houver dados explícitos, chame com arguments = {} apenas.
- NÃO faça perguntas nesta etapa; o fluxo interno cuidará da coleta dos dados.
- IMPORTANTE: O tipo de venda será perguntado primeiro, pois determina campos condicionais.

TIPOS DE VENDA:
1 = Abate (Slaughter)
2 = Consumo (Consumption)
3 = Doação (Donation)
4 = Transferência (Transfer)
5 = Venda (Sale)

QUANDO NÃO USAR:
- Alterar campo em andamento → changeSaleRegistrationField.
- Confirmar → confirmSaleRegistration.
- Cancelar → cancelSaleRegistration.
- Consultas/estatísticas → não usar esta função.

EXEMPLOS:
- "Quero registrar a venda de 5 animais hoje no retiro 1" → startSaleRegistration({ quantity: 5, saleDate: "<YYYY-MM-DD de hoje>", retreat: "Retiro 1" })
- "Transferir 10 novilhas da área 2 para a área 3" → startSaleRegistration({ saleType: 2, quantity: 10, category: "novilha", area: "Área 2", originArea: "Área 3" })
- "Quero lançar uma venda" → startSaleRegistration({})`,
      parameters: {
        type: 'object',
        properties: {
          saleType: {
            type: ['integer', 'null'],
            enum: [1, 2, 3, 4, 5],
            description: '1=Abate, 2=Consumo, 3=Doação, 4=Transferência, 5=Venda',
          },
          saleDate: { type: 'string', format: 'date' },
          aliveWeight: { type: ['number', 'null'], minimum: 0 },
          deadWeight: { type: ['number', 'null'], minimum: 0 },
          quantity: { type: ['integer', 'null'], minimum: 1 },
          unityValue: { type: ['number', 'null'], minimum: 0 },
          arrobaCost: { type: ['number', 'null'], minimum: 0 },
          carcassYield: { type: ['number', 'null'], minimum: 0 },
          category: { type: ['string', 'null'] },
          retreat: { type: ['string', 'null'] },
          area: { type: ['string', 'null'] },
          observation: { type: ['string', 'null'] },
          isExternalDestination: { type: ['boolean', 'null'] },
          destinationFarm: { type: ['string', 'null'] },
          destinationRetreat: { type: ['string', 'null'] },
          destinationArea: { type: ['string', 'null'] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'changeSaleRegistrationField',
      description:
        'Altera um campo específico no CADASTRO DE VENDA em andamento. Use quando o usuário disser algo como "trocar categoria", "mudar data", "alterar peso", ou similar. Esta ferramenta reenvia o menu adequado para nova escolha e, após a seleção, o sistema volta a exibir o RESUMO para confirmação.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [
              SellingField.SaleType,
              SellingField.SaleDate,
              SellingField.AliveWeight,
              SellingField.DeadWeight,
              SellingField.Quantity,
              SellingField.UnityValue,
              SellingField.ArrobaCost,
              SellingField.CarcassYield,
              SellingField.Category,
              SellingField.Retreat,
              SellingField.Area,
              SellingField.Observation,
              SellingField.IsExternalDestination,
              SellingField.DestinationFarm,
              SellingField.DestinationRetreat,
              SellingField.DestinationArea,
            ],
            description: 'Campo que o usuário deseja alterar (tipo de venda, data, pesos, quantidade, valores, categoria, localização, destino, observação).',
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
      name: 'confirmSaleRegistration',
      description: 'Confirma o cadastro de venda usando o rascunho atual. Use quando o usuário disser claramente que deseja confirmar.',
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
      name: 'cancelSaleRegistration',
      description: 'Cancela e limpa o rascunho atual do cadastro de venda. Use quando o usuário disser para cancelar ou desistir.',
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
      name: 'editSaleRecordField',
      description: `Edita um campo específico de um registro de venda já criado (não um rascunho em andamento).

QUANDO USAR:
- Após confirmar uma venda, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Editar" ou solicitar edição de um campo específico
- Use esta função para modificar: Tipo de venda, Data, Peso, Quantidade, Valor unitário, Categoria, Retiro, Área ou Observação

EXEMPLOS:
- "Alterar data de venda para 20/03/2024" → editSaleRecordField({ field: "saleDate", value: "2024-03-20" })
- "Mudar quantidade para 10" → editSaleRecordField({ field: "quantity", value: 10 })
- "Trocar categoria" → editSaleRecordField({ field: "category", value: "novilha" })

NÃO USAR para rascunhos em andamento (use changeSaleRegistrationField)`,
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [
              SellingField.SaleType,
              SellingField.SaleDate,
              SellingField.AliveWeight,
              SellingField.DeadWeight,
              SellingField.Quantity,
              SellingField.UnityValue,
              SellingField.ArrobaCost,
              SellingField.CarcassYield,
              SellingField.Category,
              SellingField.Retreat,
              SellingField.Area,
              SellingField.Observation,
              SellingField.IsExternalDestination,
              SellingField.DestinationFarm,
              SellingField.DestinationRetreat,
              SellingField.DestinationArea,
            ],
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
      name: 'deleteSaleRegistration',
      description: `Exclui um registro de venda já criado.

QUANDO USAR:
- Após confirmar uma venda, o sistema mostra botões "Editar" e "Excluir"
- Quando o usuário clicar em "Excluir" ou solicitar exclusão do registro
- Requer confirmação antes de executar

EXEMPLOS:
- Usuário clica em "Excluir" → deleteSaleRegistration({ confirmation: false }) (pedir confirmação)
- Usuário confirma exclusão → deleteSaleRegistration({ confirmation: true })

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
      },
    },
  },
]
