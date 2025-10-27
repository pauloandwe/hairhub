import { OpenAITool } from '../../types/openai-types'
import { buildSelectionTool } from '../helpers'

export const institutionTools: OpenAITool[] = [
  buildSelectionTool({
    name: 'listInstitutions',
    description:
      "Envia (no servidor) uma LISTA INTERATIVA do WhatsApp para o usuário escolher a instituição atual. IMPORTANTE: Ao usar esta ferramenta, NÃO repita ou escreva manualmente a lista em texto corrido e NÃO peça que o usuário digite números; responda algo curto como 'Enviei o menu para você escolher a instituição.' NUNCA peça o telefone ao usuário: o identificador (phone) é sempre fornecido automaticamente pelo sistema.",
  }),
]
