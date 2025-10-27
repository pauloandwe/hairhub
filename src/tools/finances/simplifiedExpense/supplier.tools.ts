import { OpenAITool } from '../../../types/openai-types'
import { buildSelectionTool } from '../../helpers'

export const supplierTools: OpenAITool[] = [
  buildSelectionTool({
    name: 'selectSupplier',
    description:
      "Envia (no servidor) uma LISTA INTERATIVA do WhatsApp para o usuário escolher o fornecedor da despesa. IMPORTANTE: Ao usar esta ferramenta, NÃO escreva manualmente a lista em texto corrido e NÃO peça que o usuário digite números; responda apenas algo curto como 'Enviei o menu para você escolher a idade.'. NUNCA peça o telefone ao usuário: o identificador (phone) é sempre fornecido automaticamente pelo sistema.",
  }),
]
