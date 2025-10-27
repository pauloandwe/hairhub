import { OpenAITool } from '../../types/openai-types'

export const farmsTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'listFarms',
      description:
        "Envia (do lado do servidor) uma LISTA INTERATIVA do WhatsApp para o usuário escolher a fazenda atual. IMPORTANTE: Ao usar esta ferramenta, NÃO repita ou escreva manualmente a lista de fazendas em texto corrido e NÃO peça que o usuário digite números; apenas responda algo curto como 'Enviei o menu para você escolher a fazenda.' NUNCA peça o telefone ao usuário: o identificador (phone) é sempre fornecido automaticamente pelo sistema.",
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Identificador (telefone) do usuário corrente. Uso estritamente interno e já disponível automaticamente. NÃO solicitar ao usuário.',
          },
        },
        required: [],
      },
    },
  },
]
