import OpenAI from 'openai'
import { env } from 'process'
import { ChatMessage } from './drafts/types'
import { appendIntentHistory, clearIntentHistory, getIntentHistory } from './intent-history.service'
import { getBusinessIdForPhone, getBusinessNameForPhone, getClientPersonalizationContextForPhone, resetActiveRegistration, getUserContextSync, setUserContext } from '../env.config'
import { formatAssistantReply } from '../utils/message'
import { sendWhatsAppMessage } from '../api/meta.api'

import { unsupportedRegistrationTools } from '../tools/utils/unsupportedRegistration.tools'
import { unsupportedQueryTools } from '../tools/utils/unsupportedQuery.tools'
import { AIResponseResult, OpenAITool } from '../types/openai-types'
import { SILENT_FUNCTIONS } from './openai.config'

import { unsupportedRegistrationFunctions } from '../functions/utils/unsupportedRegistration.functions'

import { aiLogger, logOpenAIPrompt, logOpenAIResponse, logToolExecution } from '../utils/pino'
import { appointmentFunctions } from '../functions/appointments/appointment.functions'
import { appointmentTools } from '../tools/appointments/appointment.tools'
import { appointmentQueryTools } from '../tools/appointments/appointment-queries.tools'
import { appointmentQueryFunctions } from '../functions/appointments/appointment-queries.functions'
import { appointmentRescheduleFunctions } from '../functions/appointments/reschedule/appointment-reschedule.functions'
import { appointmentRescheduleTools } from '../tools/appointments/appointment-reschedule.tools'

export class DefaultContextService {
  private static instance: DefaultContextService
  private contextTools = [...this.pickStartTools([...appointmentTools] as OpenAITool[]), ...this.pickStartTools([...appointmentRescheduleTools] as OpenAITool[]), ...(appointmentQueryTools as OpenAITool[]), ...unsupportedRegistrationTools, ...unsupportedQueryTools]
  private serviceFunctions = {
    ...unsupportedRegistrationFunctions,
    ...appointmentQueryFunctions,
    startAppointmentRegistration: appointmentFunctions.startAppointmentRegistration,
    startAppointmentReschedule: appointmentRescheduleFunctions.startAppointmentReschedule,
  }

  isFunctionTool(tool: OpenAITool): tool is OpenAI.ChatCompletionFunctionTool {
    return tool.type === 'function'
  }

  pickStartTools(tools: OpenAITool[]): OpenAITool[] {
    return tools.filter((t): t is OpenAI.ChatCompletionFunctionTool => this.isFunctionTool(t) && t.function.name.startsWith('start'))
  }

  static getInstance(): DefaultContextService {
    if (!DefaultContextService.instance) {
      DefaultContextService.instance = new DefaultContextService()
    }
    return DefaultContextService.instance
  }

  private openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  })
  protected saveHistory = async (userId: string, history: ChatMessage[]) => {
    await appendIntentHistory(userId, 'default', history)
  }

  private buildOutreachSection(userId: string): string {
    const userCtx = getUserContextSync(userId)
    const outreachReply = userCtx?.outreachReply

    if (!outreachReply) return ''

    const typeLabels: Record<string, string> = {
      scheduling: 'agendamento de horário',
      promotion: 'promoção',
      birthday: 'felicitação de aniversário',
      feedback: 'feedback',
    }
    const label = typeLabels[outreachReply.type] || outreachReply.type

    return `
          **CONTEXTO IMPORTANTE - Resposta a mensagem proativa:**
          Esta mensagem é uma RESPOSTA do cliente a uma mensagem proativa que enviamos sobre ${label}.
          A mensagem original enviada foi: "${outreachReply.message}"

          - O estabelecimento "${outreachReply.businessName}" enviou essa mensagem convidando o cliente.
          - O cliente está respondendo a esse convite.
          - Trate com prioridade e de forma acolhedora.
          - Se demonstrar interesse em agendar, inicie imediatamente com startAppointmentRegistration.
          - Se recusar, agradeça educadamente e finalize.
          - NÃO pergunte novamente se quer agendar — o cliente já está respondendo ao convite.
        `
  }

  protected buildBasePrompt(history: ChatMessage[], incomingMessage: string, userId: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const clientPersonalization = getClientPersonalizationContextForPhone(userId)
    const personalizationSection = clientPersonalization
      ? `
          **Personalização discreta do cliente (somente para contexto interno):**
          ${clientPersonalization}

          **Regras para uso desse contexto:**
          - Use para ajustar tom e priorização da resposta.
          - Não exponha dados sensíveis espontaneamente.
          - Só mencione esses dados se o usuário pedir explicitamente ou se for estritamente necessário para resolver a solicitação.
        `
      : ''

    const outreachSection = this.buildOutreachSection(userId)

    const array: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `
          Você é um assistente virtual amigável da plataforma de agendamento de business.

          **Contexto inicial (sem fluxo ativo):**
          O usuário está interagindo pela primeira vez ou não está em nenhum fluxo específico. Sua tarefa é identificar a intenção principal e iniciar a ferramenta apropriada.

          **Regras principais**
          - Nunca mostre IDs, códigos ou detalhes técnicos. Use apenas termos como *sua business*, *seus agendamentos*, *seus cortes*.
          - Não invente dados ou funcionalidades; responda apenas com base nas ferramentas disponíveis.
          - Não repita o nome da business; o sistema já prefixa a resposta.
          - Nunca peça telefone/WhatsApp; o sistema já fornece.
          - Jamais envie JSON, código ou detalhes técnicos. Em caso de erro, use só uma resposta curta e amigável (ex.: *"Tive um problema agora, pode tentar de novo?"*).

          **Diretrizes de intenção**
          - Se o usuário disser "olá", "bom dia" ou cumprimentos semelhantes → apenas cumprimente de forma curta e amigável (ex.: *"Olá, como posso ajudar com seus agendamentos?"* ou *"Oi! Quer agendar um corte, verificar horários ou reagendar?"* responda amigavelmente e use um ou outro emoji para deixar a conversa mais natural e humana).
          - Se o usuário mencionar uma ação (ex.: *agendar*, *remarcar*, *cancelar*, *verificar horários*, *ver histórico*) → identifique a intenção e inicie o fluxo correspondente com a ferramenta apropriada.

          **IMPORTANTE - Registros/Agendamentos disponíveis no sistema:**
            * Agendamento de corte/serviço → use startAppointmentRegistration
            * Para QUALQUER outro tipo de cadastro ou solicitação → use reportUnsupportedRegistration

          **IMPORTANTE - Consultas/Buscas disponíveis no sistema:**
            * Horários disponíveis → use getAvailableTimeSlots
            * Histórico de cortes/agendamentos → use getAppointmentHistory
            * Serviços disponíveis → use getServices
            * Para QUALQUER outra consulta → use reportUnsupportedQuery

          - Se houver ambiguidade, faça **uma única pergunta de esclarecimento**, curta e objetiva, para confirmar a intenção antes de acionar um fluxo.
          - Caso o usuário envie apenas um número ou palavra solta sem contexto → peça de forma curta que ele explique melhor o que deseja.

          **Diretrizes de fluxo**
          - Sempre inicie fluxos usando a ferramenta de *start* apropriada.
          - Para confirmar ou cancelar, siga as mesmas regras dos fluxos ativos (sim = confirmar, não = cancelar).
          - Nunca avance em agendamentos sem que o usuário tenha iniciado o fluxo correspondente.
          - Faça apenas **uma pergunta por vez**.

          ${personalizationSection}

          ${outreachSection}
        `,
      },
      ...history,
      { role: 'user', content: incomingMessage },
    ]

    return array
  }

  protected getFunctionToCall = (functionName: string) => {
    return this.serviceFunctions[functionName as keyof typeof this.serviceFunctions]
  }
  protected getTools = async (): Promise<OpenAITool[]> => {
    return this.contextTools
  }

  protected executeToolFunction = async (toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall, phone: string) => {
    if (toolCall.type !== 'function') {
      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        content: JSON.stringify({ error: 'Tipo de tool_call não suportado' }),
      }
    }

    const functionName = toolCall.function.name
    const functionToCall = this.getFunctionToCall(functionName)

    if (!functionToCall) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        content: JSON.stringify({
          error: `Função "${functionName}" não encontrada.`,
        }),
      }
    }

    try {
      const args = JSON.parse(toolCall.function.arguments || '{}')

      const storedFarmId = getBusinessIdForPhone(phone)

      const result = await functionToCall({
        ...args,
        farmId: storedFarmId || args.farmId,
        phone,
      })

      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        content: JSON.stringify(result),
      }
    } catch (error) {
      console.error(`Erro ao parsear argumentos ou executar a função ${functionName}:`, error)
      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        content: JSON.stringify({
          error: 'Ops, ocorreu um erro ao executar a função. Tente novamente.',
        }),
      }
    }
  }

  protected verifySilentToolResponse = async (toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall, toolResponse: { tool_call_id: string; role: string; content: string }): Promise<AIResponseResult | null> => {
    if (SILENT_FUNCTIONS.has(toolCall.function.name)) {
      const rawResponse = toolResponse.content

      const parsed = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse
      if (parsed?.error) {
        const msg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error)
        return { text: msg, suppress: false }
      }

      return { text: '', suppress: true }
    }
    return null
  }

  protected resetSession = async (userId: string) => {
    resetActiveRegistration(userId)
    await clearIntentHistory(userId, 'default')
  }

  protected getLlmResponse = async (userId: string, incomingMessage: string): Promise<AIResponseResult> => {
    const requestId = userId
    const contextLogger = aiLogger.child({ userId, requestId })
    const intentHistory = await getIntentHistory(userId, 'default')
    const defaultFlowPrompt = this.buildBasePrompt(intentHistory, incomingMessage, userId)
    logOpenAIPrompt('default_context', defaultFlowPrompt, { userId })
    console.log('\n\n\n\n', defaultFlowPrompt, '\n\n\n\n', await this.getTools())
    contextLogger.info('Iniciando chamada à OpenAI')
    const openAiAgent = await this.openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: defaultFlowPrompt,
      tools: await this.getTools(),
      tool_choice: 'auto',
    })
    const openAiResponse = openAiAgent.choices[0].message
    const agentHasFoundFunctionCall = openAiResponse?.tool_calls?.[0]
    const logAgentToolCall = agentHasFoundFunctionCall?.type === 'function' ? agentHasFoundFunctionCall.function : undefined
    logOpenAIResponse('default_context', openAiAgent, {
      userId,
      hasToolCall: !!agentHasFoundFunctionCall,
      toolName: logAgentToolCall?.name,
    })
    if (!agentHasFoundFunctionCall) {
      contextLogger.info(
        {
          responseType: 'direct',
          content: openAiResponse.content?.substring(0, 100),
        },
        'Nenhuma tool call encontrada, retornando resposta direta',
      )
      return {
        text: openAiResponse.content || 'Não consegui entender, vamos tentar novamente, me diga, o que posso fazer por você hoje?',
        suppress: false,
      }
    }

    contextLogger.info(
      {
        toolName: logAgentToolCall?.name,
        toolArgs: logAgentToolCall?.arguments,
      },
      'Executando tool call',
    )
    const toolResponse = await this.executeToolFunction(agentHasFoundFunctionCall, userId)
    logToolExecution(logAgentToolCall?.name ?? '', toolResponse, { userId })

    try {
      const parsedToolResponse = JSON.parse(toolResponse.content)
      if (!parsedToolResponse?.error) {
        await clearIntentHistory(userId, 'default')
        contextLogger.info({ toolName: logAgentToolCall?.name }, 'Histórico da intenção "default" limpo após tool call bem-sucedida')
      }
    } catch (err) {
      contextLogger.warn({ toolName: logAgentToolCall?.name, error: err }, 'Erro ao parsear resposta da tool para verificar limpeza de histórico')
    }

    const isSilentResponse = await this.verifySilentToolResponse(agentHasFoundFunctionCall as OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall, toolResponse)
    if (isSilentResponse) {
      contextLogger.info({ toolName: logAgentToolCall?.name }, 'Tool retornou resposta silenciosa')
      return isSilentResponse
    }

    if (!isSilentResponse && agentHasFoundFunctionCall) {
      contextLogger.warn(
        {
          toolName: logAgentToolCall?.name,
        },
        'Tool call encontrada mas não é resposta silenciosa - possível implementação incorreta',
      )
    }

    if (toolResponse.content) {
      const finalPrompt = [...defaultFlowPrompt, openAiResponse, toolResponse]

      logOpenAIPrompt('final_response', finalPrompt, {
        userId,
        afterToolCall: logAgentToolCall?.name,
      })

      contextLogger.info('Gerando resposta final com contexto da tool')
      const finalResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: finalPrompt,
      })

      logOpenAIResponse('final_response', finalResponse, { userId })

      await this.resetSession(userId)

      const finalText = finalResponse.choices[0].message.content || 'Não consegui entender, vamos tentar novamente, me diga, o que posso fazer por você hoje?'

      contextLogger.info(
        {
          responseLength: finalText.length,
        },
        'Resposta final gerada com sucesso',
      )

      return {
        text: finalText,
        suppress: false,
      }
    }

    await this.resetSession(userId)
    contextLogger.info('Usando resposta fallback')
    return {
      text: openAiResponse.content || 'Não consegui entender, vamos tentar novamente, me diga, o que posso fazer por você hoje?',
      suppress: false,
    }
  }

  handleFlowInitiation = async (userId: string, incomingMessage: string) => {
    try {
      const farmName = getBusinessNameForPhone(userId)
      const batchContent: ChatMessage[] = []
      const llmResponse = await this.getLlmResponse(userId, incomingMessage)
      let responseText = llmResponse.text

      const userContext = getUserContextSync(userId)
      const flowType = userContext?.activeRegistration?.type
      const flowStep = userContext?.activeRegistration?.step

      if (userContext?.outreachReply) {
        await setUserContext(userId, { outreachReply: null })
      }

      const { display, history: historyContent } = formatAssistantReply(responseText, farmName || undefined, flowType, flowStep)

      responseText = display
      batchContent.push({ role: 'user', content: incomingMessage })

      if (llmResponse.suppress) {
        await this.saveHistory(userId, batchContent)
        return
      }

      if (historyContent) {
        batchContent.push({ role: 'assistant', content: historyContent })
      }

      await this.saveHistory(userId, batchContent)
      await sendWhatsAppMessage(userId, responseText)
    } catch (error) {
      console.error('[GenericContextService] Erro ao processar mensagem:', error)
      await sendWhatsAppMessage(userId, 'Ops! Tive um problema para processar sua mensagem. Pode tentar de novo?')
    }
  }
}
