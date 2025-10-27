import { OpenAITool } from '../../types/openai-types'

export const productCategoriesTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'createCategory',
      description: 'Cria uma nova categoria de produto no sistema financeiro. Requer apenas o nome da categoria. O telefone do usuário é obtido automaticamente do contexto da conversa.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Nome da categoria a ser criada.',
          },
        },
        required: ['name'],
      },
    },
  },
]
