import { OpenAITool } from '../../types/openai-types'

export const animalLotTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'getAnimalQuantity',
      description: 'Obtém a quantidade de animais disponíveis no lote.',
      parameters: {
        type: 'object',
        properties: {
          lotName: {
            type: 'string',
            description: 'Nome do lote a ser consultado.',
          },
        },
        required: ['lotName'],
      },
    },
  },
]
