import OpenAI from 'openai'
import { env } from 'process'
import { buildNaturalLanguagePrompt } from '../utils/systemPrompts'
import { getUserNameForPhone, getBusinessNameForPhone, getClientPersonalizationContextForPhone } from '../env.config'
import { aiLogger } from '../utils/pino'

export interface GenerateNaturalTextOptions {
  context: string
  purpose: string
  userName?: string
  farmName?: string
  clientPersonalizationContext?: string
  additionalInstructions?: string
  maxLength?: 'short' | 'medium' | 'long'
  maxTokens?: number
}

export interface GenerateNaturalTextByPhoneOptions {
  phone: string
  context: string
  purpose: string
  additionalInstructions?: string
  maxLength?: 'short' | 'medium' | 'long'
  maxTokens?: number
}

export class NaturalLanguageGeneratorService {
  private static instance: NaturalLanguageGeneratorService

  static getInstance(): NaturalLanguageGeneratorService {
    if (!NaturalLanguageGeneratorService.instance) {
      NaturalLanguageGeneratorService.instance = new NaturalLanguageGeneratorService()
    }
    return NaturalLanguageGeneratorService.instance
  }

  private openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  })

  async generateNaturalText(options: GenerateNaturalTextOptions): Promise<string> {
    const { context, purpose, userName, farmName, clientPersonalizationContext, additionalInstructions, maxLength = 'medium', maxTokens } = options

    const lengthInstructions = {
      short: 'IMPORTANTE: Seja EXTREMAMENTE conciso. Máximo de 1-2 frases curtas (cerca de 50 caracteres total). Vá direto ao ponto.',
      medium: 'Mantenha a mensagem concisa (máximo 2-3 frases curtas).',
      long: 'Você pode ser um pouco mais detalhado, mas ainda mantenha conciso (máximo 4-5 frases).',
    }

    const tokenLimits = {
      short: 30,
      medium: 100,
      long: 200,
    }

    const finalMaxTokens = maxTokens || tokenLimits[maxLength]
    const finalInstructions = additionalInstructions ? `${additionalInstructions}\n\n${lengthInstructions[maxLength]}` : lengthInstructions[maxLength]

    const systemPrompt = buildNaturalLanguagePrompt({
      userName,
      farmName,
      clientPersonalizationContext,
      purpose,
      context,
      additionalInstructions: finalInstructions,
    })

    const logger = aiLogger.child({
      service: 'NaturalLanguageGenerator',
      purpose,
      userName,
      farmName,
      clientPersonalizationContext,
      maxLength,
    })

    try {
      logger.info('Gerando texto em linguagem natural')

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: 'Gere a mensagem baseada no contexto fornecido.',
          },
        ],
        temperature: 0.7,
        max_tokens: finalMaxTokens,
      })

      const generatedText = response.choices[0].message.content?.trim() || ''

      logger.info(
        {
          generatedText: generatedText.substring(0, 100),
          tokensUsed: response.usage?.total_tokens,
          maxLength,
        },
        'Texto gerado com sucesso',
      )

      return generatedText
    } catch (error) {
      logger.error({ error }, 'Erro ao gerar texto em linguagem natural')
      return context
    }
  }

  async generateNaturalTextByPhone(options: GenerateNaturalTextByPhoneOptions): Promise<string> {
    const { phone, context, purpose, additionalInstructions, maxLength, maxTokens } = options

    const userName = getUserNameForPhone(phone)
    const farmName = getBusinessNameForPhone(phone)
    const clientPersonalizationContext = getClientPersonalizationContextForPhone(phone)

    return this.generateNaturalText({
      context,
      purpose,
      userName,
      farmName,
      clientPersonalizationContext,
      additionalInstructions,
      maxLength,
      maxTokens,
    })
  }

  async generateSummaryText(phone: string, summaryContext: string, options?: { maxLength?: 'short' | 'medium' | 'long'; title?: string; tone?: 'success' | 'error' }): Promise<string> {
    const { maxLength = 'medium', title, tone = 'success' } = options ?? {}
    const toneContext = tone === 'error' ? 'Situação: Falha ao cadastrar o registro.' : ''
    const contextWithTitle = [title ? `Título: ${title}` : null, toneContext, summaryContext].filter(Boolean).join('\n\n')
    const instructions = [
      'Transforme os tópicos e listas em um texto fluido e natural, integrando todas as informações em um parágrafo contínuo. NÃO use bullet points, listas ou quebras de linha. Destaque os principais dados de forma conversacional.',
      title ? `Use o título "${title}" como ponto de partida, conectando-o naturalmente à mensagem.` : null,
      tone === 'error' ? 'Deixe explícito que o registro NÃO foi cadastrado e que o usuário precisa corrigir ou tentar novamente mais tarde.' : null,
    ]
      .filter(Boolean)
      .join(' ')

    return this.generateNaturalTextByPhone({
      phone,
      context: contextWithTitle,
      purpose: 'Gerar um resumo amigável do registro que foi criado',
      additionalInstructions: instructions,
      maxLength,
    })
  }

  async generateSuccessMessage(phone: string, summaryContext: string, actionType: 'created' | 'updated' | 'deleted', maxLength: 'short' | 'medium' | 'long' = 'short'): Promise<string> {
    const purposeMap = {
      created: 'Informar o usuário que o cadastro foi realizado com sucesso',
      updated: 'Informar o usuário que a edição foi realizada com sucesso',
      deleted: 'Informar o usuário que a exclusão foi realizada com sucesso',
    }

    return this.generateNaturalTextByPhone({
      phone,
      context: summaryContext,
      purpose: purposeMap[actionType],
      additionalInstructions: 'Seja celebrativo e confirme a ação realizada de forma positiva. Use apenas 1 emoji no máximo.',
      maxLength,
    })
  }

  async generateConfirmationMessage(phone: string, summaryContext: string): Promise<string> {
    return this.generateNaturalTextByPhone({
      phone,
      context: summaryContext,
      purpose: 'Solicitar confirmação dos dados antes de finalizar o cadastro',
      additionalInstructions: 'Mostre o resumo e peça ao usuário que confirme se está tudo certo.',
    })
  }
}

export const naturalLanguageGenerator = NaturalLanguageGeneratorService.getInstance()
