import { OpenAITool } from '../types/openai-types'

export function buildSelectionTool(params: { name: string; description: string }): OpenAITool {
  const { name, description } = params
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Identificador (telefone) do usuário corrente. Uso interno; já fornecido automaticamente. NÃO solicitar ao usuário.',
          },
        },
        required: [],
      },
    },
  }
}
