import OpenAI from 'openai'
import { env } from 'process'
import { ChatMessage } from './drafts/types'
import { appendIntentHistory, clearIntentHistory, getIntentHistory } from './intent-history.service'
import { getAssistantContextForPhone, getBusinessIdForPhone, getBusinessNameForPhone, getBusinessPhoneForPhone, getBusinessTypeForPhone, getClientPersonalizationContextForPhone, resetActiveRegistration, getUserContextSync, setUserContext } from '../env.config'
import type { PendingAppointmentDateClarification } from '../env.config'
import { formatAssistantReply } from '../utils/message'
import { sendWhatsAppMessage } from '../api/meta.api'

import { unsupportedRegistrationTools } from '../tools/utils/unsupportedRegistration.tools'
import { unsupportedQueryTools } from '../tools/utils/unsupportedQuery.tools'
import { AIResponseResult, OpenAITool } from '../types/openai-types'
import { SILENT_FUNCTIONS } from './openai.config'

import { unsupportedRegistrationFunctions } from '../functions/utils/unsupportedRegistration.functions'

import { aiLogger, logOpenAIPrompt, logOpenAIResponse, logToolExecution } from '../utils/pino'
import { appointmentFunctions } from '../functions/appointments/appointment.functions'
import { appointmentCancellationFunctions } from '../functions/appointments/cancellation/appointment-cancellation.functions'
import { appointmentTools } from '../tools/appointments/appointment.tools'
import { appointmentCancellationTools } from '../tools/appointments/appointment-cancellation.tools'
import { appointmentQueryTools } from '../tools/appointments/appointment-queries.tools'
import { appointmentQueryFunctions } from '../functions/appointments/appointment-queries.functions'
import { appointmentRescheduleFunctions } from '../functions/appointments/reschedule/appointment-reschedule.functions'
import { appointmentRescheduleTools } from '../tools/appointments/appointment-reschedule.tools'
import { registerAppointmentAvailabilityResolutionHandler } from '../interactives/appointments/availabilityResolutionSelection'
import { normalizeAppointmentToolArguments } from './appointments/appointment-tool-args'
import { APPOINTMENT_DATE_CLARIFICATION_TTL_MS, isIsoTimestampExpired, toFutureIsoTimestamp } from './appointments/appointment-date-clarification'

const DATE_NORMALIZED_FUNCTIONS = new Set(['getAvailableTimeSlots', 'startAppointmentRegistration'] as const)

export class DefaultContextService {
  private static instance: DefaultContextService
  private contextTools = [
    ...this.pickStartTools([...appointmentTools] as OpenAITool[]),
    ...this.pickStartTools([...appointmentCancellationTools] as OpenAITool[]),
    ...this.pickStartTools([...appointmentRescheduleTools] as OpenAITool[]),
    ...(appointmentQueryTools as OpenAITool[]),
    ...unsupportedRegistrationTools,
    ...unsupportedQueryTools,
  ]
  private serviceFunctions = {
    ...unsupportedRegistrationFunctions,
    ...appointmentQueryFunctions,
    startAppointmentRegistration: appointmentFunctions.startAppointmentRegistration,
    startAppointmentCancellation: appointmentCancellationFunctions.startAppointmentCancellation,
    startAppointmentReschedule: appointmentRescheduleFunctions.startAppointmentReschedule,
  }

  private constructor() {
    registerAppointmentAvailabilityResolutionHandler()
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

  private buildBusinessAssistantSection(userId: string): string {
    const businessName = getBusinessNameForPhone(userId)
    const businessPhone = getBusinessPhoneForPhone(userId)
    const businessType = getBusinessTypeForPhone(userId)
    const assistantContext = getAssistantContextForPhone(userId)

    if (!businessName && !businessPhone && !assistantContext) return ''

    return `
          **Business identificada automaticamente pelo número que recebeu a mensagem:**
          ${businessName ? `- Nome: ${businessName}` : ''}
          ${businessType ? `- Tipo: ${businessType}` : ''}
          ${businessPhone ? `- Telefone de destino: ${businessPhone}` : ''}

          ${assistantContext ? `**Contexto configurado da IA para este estabelecimento:**\n${assistantContext}` : ''}
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
    const businessAssistantSection = this.buildBusinessAssistantSection(userId)

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
          - Se o usuário disser "olá", "bom dia" ou cumprimentos semelhantes → responda como uma conversa real de WhatsApp: curta, leve, natural e humana, sem soar como mensagem pronta. Puxe para o agendamento de forma espontânea, como quem está atendendo de verdade (ex.: *"Oi! Tudo bem? Quer que eu veja um horário pra você hoje?"*, *"Opa, tudo certo? Se quiser, já posso te ajudar a marcar um horário hoje 😊"*). Evite frases travadas ou muito formais, evite a abertura genérica *"como posso ajudar com seus agendamentos?"* e não desvie para remarcar, cancelar ou consultar horários se o usuário apenas cumprimentou.
          - Se o usuário mencionar uma ação (ex.: *agendar*, *remarcar*, *cancelar horário*, *verificar horários*, *ver histórico*) → identifique a intenção e inicie o fluxo correspondente com a ferramenta apropriada.

          **IMPORTANTE - A plataforma é focada em agendamentos:**
            * Agendamento de corte/serviço → use startAppointmentRegistration
            * Cancelamento de agendamento → use startAppointmentCancellation
            * Remarcação de agendamento → use startAppointmentReschedule
            * Solicitações fora do escopo de agendamentos → use reportUnsupportedRegistration

          **IMPORTANTE - Consultas/Buscas disponíveis no sistema:**
            * Próximos agendamentos / "quando é meu horário?" → use getUpcomingAppointments
            * Horários disponíveis em consulta ampla (ex.: "quais horários tem amanhã?") → use getAvailableTimeSlots
            * Histórico de cortes/agendamentos → use getAppointmentHistory
            * Serviços disponíveis → use getServices
            * Barbeiros/profissionais disponíveis → use getProfessionals
            * Para QUALQUER outra consulta fora desse escopo → use reportUnsupportedQuery

          **REGRA IMPORTANTE PARA AGENDAMENTO DIRETO VS. CONSULTA DE DISPONIBILIDADE:**
          - Use startAppointmentRegistration com intentMode = "check_then_offer" SOMENTE quando o usuário estiver realmente PERGUNTANDO se existe um horário exato antes de decidir marcar.
          - Exemplos de check_then_offer:
            * "Tem horário amanhã às 15h com o João?"
            * "Há vaga sexta às 14h para barba?"
            * "Consegue me encaixar amanhã às 15h?"
          - Se a frase for um pedido direto para agendar, use startAppointmentRegistration no modo normal ("book"), mesmo que já venha com data e horário exatos.
          - Exemplos de book:
            * "Quero agendar um horário para amanhã às 15h com o João"
            * "Preciso marcar corte + barba amanhã às 15h"
            * "Agenda pra mim amanhã às 15h com o João"
          - Só use getAvailableTimeSlots quando a pessoa estiver pedindo opções de horários, e não um horário exato para possível marcação.
          - Expressoes como "dia 16", "dia 10", "16 de marco" e "amanha" ja podem ser resolvidas internamente pelo sistema. Nesses casos, nao peca mes/ano se a referencia ja for suficiente para a proxima data valida no fuso da business.
          - Se o usuario disser "quero ver os horarios disponiveis dia 16", chame getAvailableTimeSlots mesmo sem converter a data manualmente para ISO.
          - Se o usuario disser "tem horario dia 16 as 15h?", chame startAppointmentRegistration com intentMode = "check_then_offer" e deixe a normalizacao da data para a camada interna.
          - Se houver ambiguidade, faça **uma única pergunta de esclarecimento**, curta e objetiva, para confirmar a intenção antes de acionar um fluxo.
          - Caso o usuário envie apenas um número ou palavra solta sem contexto → peça de forma curta que ele explique melhor o que deseja.

          **Diretrizes de fluxo**
          - Sempre inicie fluxos usando a ferramenta de *start* apropriada.
          - Para confirmar ou cancelar, siga as mesmas regras dos fluxos ativos: só confirme com confirmação explícita, só cancele com desistência inequívoca e não trate uma resposta negativa ligada ao campo atual como cancelamento automático.
          - Nunca avance em agendamentos sem que o usuário tenha iniciado o fluxo correspondente.
          - Faça apenas **uma pergunta por vez**.

          **Regras para resposta com disponibilidade**
          - Quando a tool getAvailableTimeSlots retornar \`available_slots_display\` e \`available_slots_raw\`, use apenas \`available_slots_display\` para listar opções ao cliente.
          - Nunca liste horários operacionais da malha bruta (\`available_slots_raw\`) na resposta em linguagem natural.
          - Se a tool indicar \`availability_precision = "suggestive_without_service"\`, deixe claro em uma frase curta que são opções iniciais e que a confirmação final depende do serviço escolhido.

          ${personalizationSection}

          ${businessAssistantSection}

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

  private resolveRuntimeLocale(runtimeContext?: Record<string, unknown>): string {
    return String(runtimeContext?.locale || runtimeContext?.language || 'pt-BR')
  }

  private buildSyntheticToolCall(functionName: string, args: Record<string, unknown>, id: string): OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall {
    return {
      id,
      type: 'function',
      function: {
        name: functionName,
        arguments: JSON.stringify(args),
      },
    }
  }

  private async invokePreparedToolCall(toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall, phone: string, args: Record<string, unknown>) {
    const functionToCall = this.getFunctionToCall(toolCall.function.name)

    if (!functionToCall) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        content: JSON.stringify({
          error: `Função "${toolCall.function.name}" não encontrada.`,
        }),
      }
    }

    const storedFarmId = getBusinessIdForPhone(phone)
    const result = await functionToCall({
      ...args,
      farmId: storedFarmId || args.farmId,
      phone,
    } as any)

    return {
      tool_call_id: toolCall.id,
      role: 'tool' as const,
      content: JSON.stringify(result),
    }
  }

  private async buildToolDrivenResponse(userId: string, incomingMessage: string, toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall, toolResponse: { tool_call_id: string; role: 'tool'; content: string }): Promise<AIResponseResult> {
    const intentHistory = await getIntentHistory(userId, 'default')
    let parsedToolResponse: any = null
    try {
      parsedToolResponse = JSON.parse(toolResponse.content)
    } catch {}

    if (!parsedToolResponse?.error) {
      await clearIntentHistory(userId, 'default')
    }

    const isSilentResponse = await this.verifySilentToolResponse(toolCall, toolResponse)
    if (isSilentResponse) {
      return isSilentResponse
    }

    const defaultFlowPrompt = this.buildBasePrompt(intentHistory, incomingMessage, userId)
    const assistantToolCallMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
      role: 'assistant',
      content: null,
      tool_calls: [toolCall],
    }
    const finalPrompt = [...defaultFlowPrompt, assistantToolCallMessage, toolResponse]

    logOpenAIPrompt('final_response', finalPrompt, {
      userId,
      afterToolCall: toolCall.function.name,
      source: 'prepared_tool_call',
    })

    const finalResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: finalPrompt,
    })

    logOpenAIResponse('final_response', finalResponse, { userId })

    await this.resetSession(userId)

    return {
      text: finalResponse.choices[0].message.content || 'Não consegui entender, vamos tentar novamente, me diga, o que posso fazer por você hoje?',
      suppress: false,
    }
  }

  private async finalizeHandledResponse(userId: string, historyIncomingMessage: string, llmResponse: AIResponseResult) {
    const farmName = getBusinessNameForPhone(userId)
    const batchContent: ChatMessage[] = []
    let responseText = llmResponse.text

    const userContext = getUserContextSync(userId)
    const flowType = userContext?.activeRegistration?.type
    const flowStep = userContext?.activeRegistration?.step

    if (userContext?.outreachReply) {
      await setUserContext(userId, { outreachReply: null })
    }

    const { display, history: historyContent } = formatAssistantReply(responseText, farmName || undefined, flowType, flowStep)

    responseText = display
    batchContent.push({ role: 'user', content: historyIncomingMessage })

    if (llmResponse.suppress) {
      await this.saveHistory(userId, batchContent)
      return
    }

    if (historyContent) {
      batchContent.push({ role: 'assistant', content: historyContent })
    }

    await this.saveHistory(userId, batchContent)
    await sendWhatsAppMessage(userId, responseText)
  }

  private async storePendingAppointmentDateClarification(userId: string, functionName: 'getAvailableTimeSlots' | 'startAppointmentRegistration', argsSnapshot: Record<string, unknown>, originalMessage: string, partialInterpretation: PendingAppointmentDateClarification['partialInterpretation']) {
    await setUserContext(userId, {
      pendingAppointmentDateClarification: {
        functionName,
        argsSnapshot,
        originalMessage,
        partialInterpretation,
        createdAt: new Date().toISOString(),
        expiresAt: toFutureIsoTimestamp(APPOINTMENT_DATE_CLARIFICATION_TTL_MS),
      },
    })
  }

  async resumePendingAppointmentDateClarification(userId: string, incomingMessage: string): Promise<boolean> {
    const runtimeContext = getUserContextSync(userId)
    const pending = runtimeContext?.pendingAppointmentDateClarification

    if (!pending) {
      return false
    }

    if (isIsoTimestampExpired(pending.expiresAt)) {
      await setUserContext(userId, { pendingAppointmentDateClarification: null })
      aiLogger.info(
        {
          userId,
          functionName: pending.functionName,
          originalMessage: pending.originalMessage,
          expiredAt: pending.expiresAt,
        },
        'pending_date_clarification_expired',
      )
      return false
    }

    const normalized = await normalizeAppointmentToolArguments({
      functionName: pending.functionName,
      args: pending.argsSnapshot,
      incomingMessage,
      timezone: runtimeContext?.businessTimezone,
      locale: this.resolveRuntimeLocale(runtimeContext as Record<string, unknown> | undefined),
      pendingClarification: pending,
    })

    if (normalized.resolution?.requiresClarification || !normalized.resolution?.normalizedDate) {
      await this.storePendingAppointmentDateClarification(userId, pending.functionName, pending.argsSnapshot, pending.originalMessage, normalized.interpretation ?? pending.partialInterpretation)

      await sendWhatsAppMessage(userId, normalized.resolution?.clarificationMessage || 'Nao consegui entender essa data. Me fala com mais detalhe, por favor.')
      return true
    }

    await setUserContext(userId, { pendingAppointmentDateClarification: null })

    aiLogger.info(
      {
        userId,
        functionName: pending.functionName,
        originalMessage: pending.originalMessage,
        incomingMessage,
        normalizedArgs: normalized.args,
        appointmentDateResolution: normalized.resolution,
      },
      'pending_date_clarification_resolved',
    )

    const combinedMessage = `${pending.originalMessage}\nComplemento do cliente: ${incomingMessage}`
    const syntheticToolCall = this.buildSyntheticToolCall(pending.functionName, normalized.args, 'pending_date_clarification_tool')
    const toolResponse = await this.invokePreparedToolCall(syntheticToolCall, userId, normalized.args)
    const llmResponse = await this.buildToolDrivenResponse(userId, combinedMessage, syntheticToolCall, toolResponse)
    await this.finalizeHandledResponse(userId, incomingMessage, llmResponse)
    return true
  }

  protected executeToolFunction = async (toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall, phone: string, incomingMessage?: string) => {
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
      const rawArgs = JSON.parse(toolCall.function.arguments || '{}')
      const runtimeContext = getUserContextSync(phone)
      const normalized = await normalizeAppointmentToolArguments({
        functionName,
        args: rawArgs,
        incomingMessage,
        timezone: runtimeContext?.businessTimezone,
        locale: this.resolveRuntimeLocale(runtimeContext as Record<string, unknown> | undefined),
      })

      if (normalized.resolution?.requiresClarification) {
        if (DATE_NORMALIZED_FUNCTIONS.has(functionName as 'getAvailableTimeSlots' | 'startAppointmentRegistration') && typeof incomingMessage === 'string' && incomingMessage.trim()) {
          await this.storePendingAppointmentDateClarification(phone, functionName as 'getAvailableTimeSlots' | 'startAppointmentRegistration', rawArgs, incomingMessage.trim(), normalized.interpretation)

          aiLogger.info(
            {
              userId: phone,
              functionName,
              originalArgs: rawArgs,
              incomingMessage,
              appointmentDateResolution: normalized.resolution,
              interpretation: normalized.interpretation,
            },
            'pending_date_clarification_created',
          )
        }

        aiLogger.info(
          {
            userId: phone,
            toolName: functionName,
            originalArgs: rawArgs,
            normalizedArgs: normalized.args,
            incomingMessage,
            appointmentDateResolution: normalized.resolution,
          },
          '[Tool] Appointment date needs clarification before execution',
        )

        return {
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          content: JSON.stringify({
            error: normalized.resolution.clarificationMessage || 'Nao consegui entender essa data. Me fala outra, por favor.',
          }),
        }
      }

      if (normalized.resolution?.normalizedDate) {
        if (normalized.resolution.interpretationKind === 'day_only') {
          aiLogger.info(
            {
              userId: phone,
              toolName: functionName,
              originalArgs: rawArgs,
              normalizedArgs: normalized.args,
              incomingMessage,
              appointmentDateResolution: normalized.resolution,
            },
            'day_only_direct_resolution',
          )
        }

        aiLogger.info(
          {
            userId: phone,
            toolName: functionName,
            originalArgs: rawArgs,
            normalizedArgs: normalized.args,
            incomingMessage,
            appointmentDateResolution: normalized.resolution,
          },
          '[Tool] Appointment date normalized before execution',
        )
      }

      if (DATE_NORMALIZED_FUNCTIONS.has(functionName as 'getAvailableTimeSlots' | 'startAppointmentRegistration')) {
        await setUserContext(phone, { pendingAppointmentDateClarification: null })
      }

      return await this.invokePreparedToolCall(toolCall as OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall, phone, normalized.args)
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
    await resetActiveRegistration(userId)
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
    const toolResponse = await this.executeToolFunction(agentHasFoundFunctionCall, userId, incomingMessage)
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
      if (logAgentToolCall?.name === 'getAvailableTimeSlots') {
        try {
          const parsedToolResponse = JSON.parse(toolResponse.content)
          const responseData = parsedToolResponse?.data ?? {}
          const displaySlots = Array.isArray(responseData.available_slots_display) ? responseData.available_slots_display : []
          const rawSlots = Array.isArray(responseData.available_slots_raw) ? responseData.available_slots_raw : []

          contextLogger.info(
            {
              toolName: logAgentToolCall.name,
              date: responseData.date,
              displayIntervalMinutes: responseData.display_interval_minutes,
              availabilityPrecision: responseData.availability_precision,
              rawSlotsCount: rawSlots.length,
              displaySlotsCount: displaySlots.length,
              rawSlotsPreview: rawSlots.slice(0, 10),
              displaySlotsPreview: displaySlots.slice(0, 10),
            },
            'Slots enviados ao modelo final para resposta ao cliente',
          )
        } catch (error) {
          contextLogger.warn(
            {
              toolName: logAgentToolCall?.name,
              error,
            },
            'Falha ao registrar payload de disponibilidade antes da resposta final',
          )
        }
      }

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
          responsePreview: finalText.substring(0, 200),
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
      const llmResponse = await this.getLlmResponse(userId, incomingMessage)
      await this.finalizeHandledResponse(userId, incomingMessage, llmResponse)
    } catch (error) {
      console.error('[GenericContextService] Erro ao processar mensagem:', error)
      await sendWhatsAppMessage(userId, 'Ops! Tive um problema para processar sua mensagem. Pode tentar de novo?')
    }
  }
}
