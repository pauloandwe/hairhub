import { OpenAITool } from '../../types/openai-types'

export const areasTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'getCurrentHerd',
      description: "Obtém automaticamente o rebanho atual/médio (total de animais na fazenda no momento). Use quando o usuário pedir 'rebanho atual', 'quantidade atual de animais', ou similar.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]
