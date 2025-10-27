import { OpenAITool } from '../../types/openai-types'
import { buildSelectionTool } from '../helpers'

export const ageCategoryTools: OpenAITool[] = [
  buildSelectionTool({
    name: 'selectAgeGroup',
    description:
      "Envia (no servidor) uma LISTA INTERATIVA do WhatsApp para o usuário escolher o GRUPO DE IDADE do rebanho (ADULTOS, JOVENS, BEZERROS E BEZERRAS). Após a escolha, o sistema envia automaticamente uma segunda lista dependente com as CATEGORIAS disponíveis. IMPORTANTE: Ao usar esta ferramenta, NÃO escreva manualmente a lista em texto corrido e NÃO peça que o usuário digite números; responda apenas algo curto como 'Enviei o menu para você escolher a idade.'. NUNCA peça o telefone ao usuário: o identificador (phone) é sempre fornecido automaticamente pelo sistema.",
  }),
]
