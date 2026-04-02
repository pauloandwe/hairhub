import { randomUUID } from 'crypto'
import { beginOutboundCapture, clearOutboundCapture, flushOutboundCapture, sendWhatsAppMessage } from '../../api/meta.api'
import {
  ActiveRegistrationPendingStep,
  env,
  getAssistantContextForPhone,
  getBusinessIdForPhone,
  getBusinessNameForPhone,
  getBusinessPhoneForPhone,
  getBusinessTypeForPhone,
  getClientPersonalizationContextForPhone,
  getUserContextSync,
  resetActiveRegistration,
  setUserContext,
  UserRuntimeContext,
} from '../../env.config'
import { formatAssistantReply } from '../../utils/message'
import { appendIntentHistory, clearIntentHistory, ChatMessage } from '../intent-history.service'
import { draftHistoryService } from '../drafts/draft-history'
import { FlowConfig, SILENT_FUNCTIONS } from '../openai.config'
import OpenAI from 'openai'
import { FlowStep, FlowType, FlowTypeTranslation } from '../../enums/generic.enum'
import { AIResponseResult, OpenAITool } from '../../types/openai-types'
import { sendCancelFlowButton, sendReplayListGateButtons } from '../../interactives/genericConfirmation'
import { createRequestLatencyTracker } from '../../utils/request-latency'
import { aiLogger } from '../../utils/pino'
import { openAIModelConfig } from '../../config/openai-model.config'

type FieldFlowSnapshot<TDraft> = {
  draft: TDraft
  activeRegistration: NonNullable<UserRuntimeContext['activeRegistration']>
  awaitingField?: string
  pendingStep?: ActiveRegistrationPendingStep
  missingFieldsBefore: string[]
}

export abstract class GenericContextService<TDraft> {
  private openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  })
  protected abstract flowType: FlowType
  protected saveHistory = async (userId: string, history: ChatMessage[], isDraft = false) => {
    if (isDraft) {
      await draftHistoryService.appendActiveDraftHistory(userId, history)
    } else {
      await appendIntentHistory(userId, this.flowType, history)
    }
  }

  private buildClientPersonalizationGuidance(userId?: string): string {
    if (!userId) return ''
    const context = getClientPersonalizationContextForPhone(userId)
    if (!context) return ''

    return `
            **Personalização discreta do cliente (somente para contexto interno):**
            ${context}

            **Regras para uso desse contexto:**
            - Use para ajustar tom e priorização da resposta.
            - Não exponha dados sensíveis espontaneamente.
            - Só mencione esses dados se o usuário pedir explicitamente ou se for estritamente necessário para resolver a solicitação.
          `
  }

  private buildBusinessAssistantGuidance(userId?: string): string {
    if (!userId) return ''

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

  protected async buildBasePrompt(draft: any, history: ChatMessage[], incomingMessage: string, businessName?: string, userId?: string, awaitingField?: string, isEditingExistingRecord?: boolean): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const personalizationSection = this.buildClientPersonalizationGuidance(userId)
    const businessAssistantSection = this.buildBusinessAssistantGuidance(userId)

    if (awaitingField) {
      if (isEditingExistingRecord) {
        return [
          {
            role: 'system',
            content: `Você é um assistente para edição de registros de ${FlowTypeTranslation[this.flowType]} na plataforma de agendamento de business.

            **Tarefa específica:** Extrair o novo valor para o campo: "${awaitingField}"

            **Contexto:** O usuário fornecerá o novo valor para o campo "${awaitingField}" de um registro já criado.

            **Mensagem do usuário:**
            ${incomingMessage}

            **Sua tarefa:**
            1. Se o usuário demonstrar desistência explícita e inequívoca do fluxo atual, use a ferramenta de cancelamento imediatamente;
            2. Extraia APENAS o novo valor que corresponde ao campo "${awaitingField}" da mensagem do usuário;
            3. Normalize o valor conforme necessário (datas em YYYY-MM-DD, números sem símbolos);
            4. Chame a ferramenta de edição com o campo e valor extraído;

            **Regras de CANCELAMENTO (PRIORIDADE MÁXIMA):**
            - Só cancele quando houver desistência explícita e inequívoca do fluxo atual
            - Se a mensagem for uma resposta negativa que preenche ou esclarece o campo solicitado, trate-a como resposta do campo
            - Na dúvida entre cancelamento e resposta de campo, priorize a interpretação como resposta do campo
            - Não pergunte se quer cancelar; apenas execute quando a desistência estiver clara
            - Cancelamento tem PRIORIDADE MÁXIMA sobre qualquer outra extração de dados

            **Regras gerais:**
            - Seja direto e objetivo
            - Datas devem estar em formato YYYY-MM-DD
            - Números sem símbolos especiais
            - Não faça perguntas, apenas extraia e execute

            ${businessName ? `Business: ${businessName}` : ''}
            ${businessAssistantSection}
            ${personalizationSection}`,
          },
          { role: 'user', content: incomingMessage },
        ]
      }
      return [
        {
          role: 'system',
          content: `Você é um assistente de coleta de dados para ${FlowTypeTranslation[this.flowType]} na plataforma de agendamento de business.

          **Tarefa específica:** Extrair o valor para o campo: "${awaitingField}"

          **Contexto:** O usuário fornecerá informações sobre o campo "${awaitingField}".

          **Mensagem do usuário:**
          ${incomingMessage}

          **Sua tarefa:**
          1. Se o usuário demonstrar desistência explícita e inequívoca do fluxo atual, use a ferramenta de cancelamento imediatamente;
          2. Extraia APENAS o valor que corresponde ao campo "${awaitingField}" da mensagem do usuário;
          3. Normalize o valor conforme necessário (datas em YYYY-MM-DD, números sem símbolos);
          4. Chame a ferramenta com o valor extraído;

          **Regras de CANCELAMENTO (PRIORIDADE MÁXIMA):**
          - Só cancele quando houver desistência explícita e inequívoca do fluxo atual
          - Se a mensagem for uma resposta negativa que preenche ou esclarece o campo solicitado, trate-a como resposta do campo
          - Na dúvida entre cancelamento e resposta de campo, priorize a interpretação como resposta do campo
          - Não pergunte se quer cancelar; apenas execute quando a desistência estiver clara
          - Cancelamento tem PRIORIDADE MÁXIMA sobre qualquer outra extração de dados

          **Regras gerais:**
          - Seja direto e objetivo
          - Datas devem estar em formato YYYY-MM-DD
          - Não faça perguntas, apenas extraia e execute

          ${businessName ? `Business: ${businessName}` : ''}
          ${businessAssistantSection}
          ${personalizationSection}`,
        },
        { role: 'user', content: incomingMessage },
      ]
    }

    return [
      {
        role: 'system',
        content: `Você é um assistente virtual amigável da plataforma de agendamento de business.
        Sua única função é auxiliar o usuário no cadastro de ${FlowTypeTranslation[this.flowType]}.

        **Contexto:** Cadastro de ${FlowTypeTranslation[this.flowType]}

        **Dados já coletados:**
        ${JSON.stringify(draft, null, 2)}

        **Mensagem mais recente do usuário:**
        ${incomingMessage}
        **Sua única tarefa:**
        - Identifique a intenção do usuário na mensagem mais recente;
        - Extraia os valores mencionados se houverem (números, datas, textos, confirmações);
        - Chame a ferramenta apropriada com os parâmetros corretos se houverem;

        **Regras de extração:**
        - Números isolados: geralmente são quantidades ou valores
        - Confirmação explícita e inequívoca: trate como confirmação
        - Desistência ou cancelamento inequívoco do fluxo atual: trate como cancelamento
        - Resposta negativa ligada ao campo atual: trate como resposta para o campo solicitado, não como cancelamento automático
        - Datas: sempre normalize para formato ISO (YYYY-MM-DD)
        - Valores monetários: remova "R$" e converta para número

        ${businessName ? `Business: ${businessName}` : ''}
        ${businessAssistantSection}
        ${personalizationSection}

        Não explique, não pergunte. Apenas extraia e chame a ferramenta.`,
      },
      ...history,
      { role: 'user', content: incomingMessage },
    ]
  }

  protected abstract getFlowConfig: () => Required<FlowConfig>
  protected abstract getFunctionToCall: (functionName: string) => any
  protected abstract getDraft: (phone: string) => Promise<TDraft>
  protected abstract saveDraft: (phone: string, draft: TDraft) => Promise<void>
  protected abstract getMissingFields: (draft: TDraft) => Promise<string[]>
  protected abstract getDraftHistory: (userId: string) => Promise<ChatMessage[]>
  protected abstract getTools: () => Promise<OpenAITool[]>
  protected abstract replayPendingStep: (userId: string) => Promise<void>

  protected getToolsForField = async (): Promise<OpenAITool[]> => {
    const flowConfig = this.getFlowConfig()
    const allTools = await this.getTools()
    const startFunctionName = flowConfig.startFunction
    const cancelFunctionName = flowConfig.cancelFunction

    return allTools.filter((tool) => 'function' in tool && (tool.function.name === startFunctionName || tool.function.name === cancelFunctionName))
  }

  protected getToolsForEditField = async (): Promise<OpenAITool[]> => {
    const flowConfig = this.getFlowConfig()
    const allTools = await this.getTools()
    const editFunctionName = flowConfig.editFunction
    const cancelFunctionName = flowConfig.cancelFunction

    return allTools.filter((tool) => 'function' in tool && (tool.function.name === editFunctionName || tool.function.name === cancelFunctionName))
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

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  private captureFieldFlowSnapshot = async (userId: string): Promise<FieldFlowSnapshot<TDraft>> => {
    const draft = await this.getDraft(userId)
    const currentRegistration = this.cloneJson((getUserContextSync(userId)?.activeRegistration ?? {}) as UserRuntimeContext['activeRegistration'])
    const missingFieldsBefore = await this.getMissingFields(draft)

    return {
      draft: this.cloneJson(draft),
      activeRegistration: currentRegistration,
      awaitingField: currentRegistration.awaitingInputForField,
      pendingStep: currentRegistration.pendingStep,
      missingFieldsBefore,
    }
  }

  private getDraftFieldValue(draft: TDraft, field?: string): unknown {
    if (!field || typeof field !== 'string') return undefined
    return (draft as Record<string, unknown>)?.[field]
  }

  private areEquivalent(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  private hasFieldFlowProgress(args: { snapshot: FieldFlowSnapshot<TDraft>; currentDraft: TDraft; currentContext?: UserRuntimeContext; missingFieldsAfter: string[] }): boolean {
    const { snapshot, currentDraft, currentContext, missingFieldsAfter } = args
    const currentRegistration = currentContext?.activeRegistration ?? {}
    const previousField = snapshot.awaitingField
    const currentField = currentRegistration.awaitingInputForField
    const pendingMode = snapshot.pendingStep?.mode ?? (snapshot.activeRegistration.editMode ? 'editing' : 'creating')

    if (currentRegistration.status === 'completed') return true
    if (snapshot.activeRegistration.type && !currentRegistration.type) return true

    if (pendingMode === 'creating') {
      const missingBefore = new Set(snapshot.missingFieldsBefore)
      const missingAfter = new Set(missingFieldsAfter)

      if (previousField && !missingAfter.has(previousField)) {
        return true
      }

      if (currentField && currentField !== previousField && !missingAfter.has(currentField)) {
        return true
      }

      if (currentField !== previousField) {
        return true
      }

      for (const field of missingBefore) {
        if (!missingAfter.has(field)) {
          return true
        }
      }

      return false
    }

    if (currentRegistration.pendingStep && !this.areEquivalent(currentRegistration.pendingStep, snapshot.pendingStep)) {
      return true
    }

    if (currentField !== previousField) {
      return true
    }

    if (!currentField && previousField) {
      return true
    }

    const previousValue = this.getDraftFieldValue(snapshot.draft, previousField)
    const currentValue = this.getDraftFieldValue(currentDraft, previousField)
    return !this.areEquivalent(previousValue, currentValue)
  }

  private async restoreFieldFlowSnapshot(userId: string, snapshot: FieldFlowSnapshot<TDraft>): Promise<void> {
    await this.saveDraft(userId, this.cloneJson(snapshot.draft))
    await setUserContext(userId, {
      activeRegistration: {
        ...snapshot.activeRegistration,
      },
    })
  }

  private async handleOutOfFlowFallback(userId: string, snapshot: FieldFlowSnapshot<TDraft>): Promise<AIResponseResult> {
    await this.restoreFieldFlowSnapshot(userId, snapshot)
    if (!snapshot.pendingStep && snapshot.awaitingField) {
      await setUserContext(userId, {
        activeRegistration: {
          ...getUserContextSync(userId)?.activeRegistration,
          pendingStep: {
            field: snapshot.awaitingField,
            mode: snapshot.activeRegistration.editMode ? 'editing' : 'creating',
          },
        },
      })
    }

    await sendWhatsAppMessage(userId, 'Essa mensagem está fora do fluxo atual. Vou te reenviar a etapa para continuarmos.')

    const replayUi = getUserContextSync(userId)?.activeRegistration?.pendingStep?.replayUi
    if (replayUi?.surface === 'list' && replayUi.listCard) {
      await sendReplayListGateButtons({
        userId,
        header: replayUi.listCard.header,
        body: replayUi.listCard.body,
        footer: replayUi.listCard.footer,
        viewOptionsLabel: replayUi.listCard.buttonLabel,
        onViewOptions: async (currentUserId) => {
          await this.replayPendingStep(currentUserId)
        },
        onCancel: async (currentUserId) => {
          const { cancelActiveRegistration } = await import('../../interactives/followup')
          await cancelActiveRegistration(currentUserId)
        },
      })
    } else {
      await this.replayPendingStep(userId)
      await sendCancelFlowButton({ userId })
    }

    return {
      text: '',
      suppress: true,
      skipUserHistory: true,
    }
  }

  private async finalizeFieldFlowAttempt(args: { userId: string; snapshot: FieldFlowSnapshot<TDraft>; toolResponse: { tool_call_id: string; role: string; content: string }; toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall; cancelFunction?: string }): Promise<AIResponseResult> {
    const { userId, snapshot, toolResponse, toolCall, cancelFunction } = args

    if (toolCall.type === 'function' && toolCall.function.name === cancelFunction) {
      await flushOutboundCapture(userId)
      return { text: '', suppress: true }
    }

    const currentDraft = await this.getDraft(userId)
    const currentContext = getUserContextSync(userId)
    const missingFieldsAfter = await this.getMissingFields(currentDraft)
    const hasProgress = this.hasFieldFlowProgress({ snapshot, currentDraft, currentContext, missingFieldsAfter })

    if (!hasProgress) {
      clearOutboundCapture(userId)
      return this.handleOutOfFlowFallback(userId, snapshot)
    }

    await flushOutboundCapture(userId)

    try {
      const parsedToolResponse = JSON.parse(toolResponse.content)
      if (!parsedToolResponse?.error) {
        await clearIntentHistory(userId, this.flowType)
        console.log(`[GenericContext] Histórico da intenção "${this.flowType}" limpo após avanço de etapa`)
      }
    } catch (err) {
      console.warn(`[GenericContext] Erro ao parsear resposta da tool para verificar limpeza de histórico:`, err)
    }

    return { text: '', suppress: true }
  }

  protected handleEditingFlow = async (args: { userId: string; incomingMessage: string; flowConfig: FlowConfig; editingField: string; userContext: UserRuntimeContext }): Promise<AIResponseResult> => {
    const { userId, incomingMessage, flowConfig, editingField, userContext } = args
    const { activeRegistration } = userContext
    const businessName = getBusinessNameForPhone(userId)
    const snapshot = await this.captureFieldFlowSnapshot(userId)
    const trace = createRequestLatencyTracker(aiLogger, {
      module: 'generic-context',
      flowType: this.flowType,
      requestId: String(getUserContextSync(userId)?.lastRequestId || `${userId}-${Date.now()}`),
      userId,
      mode: 'editing',
    })

    try {
      const editFunctionName = flowConfig?.editFunction
      if (!editFunctionName) {
        console.error(`[State] Flow '${this.flowType}' is active but has no 'editFunction' configured.`)
        await setUserContext(userId, { activeRegistration: { ...activeRegistration, step: FlowStep.Editing, awaitingInputForField: snapshot.awaitingField, pendingStep: snapshot.pendingStep } })
        return { text: 'Houve um problema ao processar sua solicitação. Vamos tentar novamente?', suppress: false }
      }

      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)
      console.log(`Handling editing flow for user ${userId}, field: ${editingField}, message: ${incomingMessage}`)
      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)

      const editFieldPrompt = await this.buildBasePrompt({}, [], incomingMessage, businessName, userId, editingField, true)

      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)
      console.log(`editFieldPrompt`, incomingMessage, editFieldPrompt)
      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)

      const openAiAgent = await trace.run(
        'openai_edit_field',
        async () =>
          this.openai.chat.completions.create({
            model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
            messages: editFieldPrompt,
            tools: await this.getToolsForEditField(),
            tool_choice: 'required',
          }),
        {
          model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
        },
      )

      const openAiResponse = openAiAgent.choices[0].message
      const agentHasFoundFunctionCall = openAiResponse?.tool_calls?.[0]

      if (!agentHasFoundFunctionCall) {
        return this.handleOutOfFlowFallback(userId, snapshot)
      }

      beginOutboundCapture(userId)
      const toolResponse = await trace.run('execute_tool', async () => this.executeToolFunction(agentHasFoundFunctionCall, userId), {
        toolName: agentHasFoundFunctionCall.type === 'function' ? agentHasFoundFunctionCall.function.name : undefined,
      })
      return await this.finalizeFieldFlowAttempt({
        userId,
        snapshot,
        toolResponse,
        toolCall: agentHasFoundFunctionCall,
        cancelFunction: flowConfig.cancelFunction,
      })
    } catch (error) {
      clearOutboundCapture(userId)
      await this.restoreFieldFlowSnapshot(userId, snapshot)
      console.error('[GenericContextService] Erro ao processar edição:', error)
      return { text: 'Houve um problema ao processar sua solicitação. Vamos tentar novamente?', suppress: false }
    }
  }

  protected handleCreationFieldFlow = async (args: { userId: string; incomingMessage: string; flowConfig: FlowConfig; awaitingField: string; userContext: UserRuntimeContext }): Promise<AIResponseResult> => {
    const { userId, incomingMessage, flowConfig, awaitingField, userContext } = args
    const snapshot = await this.captureFieldFlowSnapshot(userId)
    const trace = createRequestLatencyTracker(aiLogger, {
      module: 'generic-context',
      flowType: this.flowType,
      requestId: String(getUserContextSync(userId)?.lastRequestId || `${userId}-${Date.now()}`),
      userId,
      mode: 'creating',
    })

    try {
      const defaultFlowPrompt = await this.buildBasePrompt({}, [], incomingMessage, undefined, userId, awaitingField, true)

      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)
      console.log(`defaultFlowPrompt awaitingField`, awaitingField, defaultFlowPrompt)
      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)

      const openAiAgent = await trace.run(
        'openai_collect_field',
        async () =>
          this.openai.chat.completions.create({
            model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
            messages: defaultFlowPrompt,
            tools: await this.getToolsForField(),
            tool_choice: 'required',
          }),
        {
          model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
        },
      )

      const openAiResponse = openAiAgent.choices[0].message
      const agentHasFoundFunctionCall = openAiResponse?.tool_calls?.[0]

      if (!agentHasFoundFunctionCall) {
        return this.handleOutOfFlowFallback(userId, snapshot)
      }

      beginOutboundCapture(userId)
      const toolResponse = await trace.run('execute_tool', async () => this.executeToolFunction(agentHasFoundFunctionCall, userId), {
        toolName: agentHasFoundFunctionCall.type === 'function' ? agentHasFoundFunctionCall.function.name : undefined,
      })
      return await this.finalizeFieldFlowAttempt({
        userId,
        snapshot,
        toolResponse,
        toolCall: agentHasFoundFunctionCall,
        cancelFunction: flowConfig.cancelFunction,
      })
    } catch (error) {
      clearOutboundCapture(userId)
      await this.restoreFieldFlowSnapshot(userId, snapshot)
      console.error('[GenericContextService] Erro ao processar field collection:', error)
      return { text: 'Houve um problema ao processar sua solicitação. Vamos tentar novamente?', suppress: false }
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

  protected getLlmResponse = async (args: { history: ChatMessage[]; incomingMessage: string; userId: string; businessName?: string }): Promise<AIResponseResult> => {
    const { history, incomingMessage, userId, businessName } = args
    const trace = createRequestLatencyTracker(aiLogger, {
      module: 'generic-context',
      flowType: this.flowType,
      requestId: String(getUserContextSync(userId)?.lastRequestId || `${userId}-${Date.now()}`),
      userId,
      mode: 'default',
    })

    const userContext = getUserContextSync(userId)
    const awaitingField = userContext?.activeRegistration?.awaitingInputForField
    const activeRegistration = userContext?.activeRegistration
    const activeFlowStatus = activeRegistration?.status
    const activeFlowType = activeRegistration?.type
    const activeFlowStep = activeRegistration?.step

    const draft = await this.getDraft(userId)

    if (!activeFlowType && activeFlowStatus !== 'completed') {
      const currentRegistration = activeRegistration || {}
      const status = currentRegistration.status && currentRegistration.status !== 'completed' ? currentRegistration.status : 'collecting'

      await setUserContext(userId, {
        activeRegistration: {
          ...currentRegistration,
          type: this.flowType,
          step: currentRegistration.step ?? FlowStep.Creating,
          status,
          awaitingInputForField: currentRegistration.awaitingInputForField,
          pendingStep: currentRegistration.pendingStep,
        },
      })
    }

    const flowConfig = this.getFlowConfig()
    console.log(`[GenericContextService] Active flow for user ${userId}:`, { activeFlowType, activeFlowStatus, activeFlowStep, awaitingField })

    if (awaitingField) {
      if (activeFlowStep === FlowStep.Editing) {
        return this.handleEditingFlow({ userId, incomingMessage, flowConfig, editingField: awaitingField, userContext })
      } else if (activeFlowStep === FlowStep.Creating) {
        return this.handleCreationFieldFlow({ userId, incomingMessage, flowConfig, awaitingField, userContext })
      }
    }

    const defaultFlowPrompt = await this.buildBasePrompt(draft, history, incomingMessage, businessName, userId)

    console.log('\n\n')
    console.log('[OpenAI] Prompt base:\n', defaultFlowPrompt)
    console.log('\n\n')

    const openAiAgent = await trace.run(
      'openai_flow_response',
      async () =>
        this.openai.chat.completions.create({
          model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
          messages: defaultFlowPrompt,
          tools: await this.getTools(),
          tool_choice: 'required',
        }),
      {
        model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
      },
    )
    const openAiResponse = openAiAgent.choices[0].message
    const agentHasFoundFunctionCall = openAiResponse?.tool_calls?.[0]

    if (!agentHasFoundFunctionCall) {
      if (activeFlowType) {
        const messageInvalidFlowPath = 'Não consegui entender, vamos tentar novamente?'
        await sendWhatsAppMessage(userId, messageInvalidFlowPath)
        const toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall = {
          id: randomUUID(),
          type: 'function',
          function: {
            name: flowConfig.startFunction,
            arguments: '{}',
          },
        }
        await this.executeToolFunction(toolCall, userId)

        return { text: '', suppress: true }
      } else {
        await resetActiveRegistration(userId)
        sendWhatsAppMessage(userId, 'Não consegui entender, vamos tentar novamente, me diga o que vamos fazer hoje.')
        return { text: '', suppress: true }
      }
    }

    const toolResponse = await trace.run('execute_tool', async () => this.executeToolFunction(agentHasFoundFunctionCall, userId), {
      toolName: agentHasFoundFunctionCall.type === 'function' ? agentHasFoundFunctionCall.function.name : undefined,
    })

    try {
      const parsedToolResponse = JSON.parse(toolResponse.content)
      if (!parsedToolResponse?.error) {
        await clearIntentHistory(userId, this.flowType)
        console.log(`[GenericContext] Histórico da intenção "${this.flowType}" limpo após tool call bem-sucedida`)
      }
    } catch (err) {
      console.warn(`[GenericContext] Erro ao parsear resposta da tool para verificar limpeza de histórico:`, err)
    }

    const isSilentResponse = await this.verifySilentToolResponse(agentHasFoundFunctionCall as OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall, toolResponse)
    if (isSilentResponse) {
      return isSilentResponse
    }

    const finalResponse = 'Não consegui processar sua solicitação, por favor tente novamente mais tarde.'
    await resetActiveRegistration(userId)
    return { text: finalResponse, suppress: false }
  }

  handleFlowInitiation = async (userId: string, incomingMessage: string) => {
    try {
      const businessName = getBusinessNameForPhone(userId)
      const batchContent: ChatMessage[] = []
      const draftHistory = await this.getDraftHistory(userId)
      const llmResponse = await this.getLlmResponse({ history: draftHistory, incomingMessage, userId, businessName })
      let responseText = llmResponse.text

      const userContext = getUserContextSync(userId)
      const flowType = userContext?.activeRegistration?.type
      const flowStep = userContext?.activeRegistration?.step

      const { display, history: historyContent } = formatAssistantReply(responseText, businessName || undefined, flowType, flowStep)

      responseText = display
      batchContent.push({ role: 'user', content: incomingMessage })

      if (llmResponse.suppress) {
        if (llmResponse.skipUserHistory) {
          return
        }
        await this.saveHistory(userId, batchContent, false)
        return
      }

      if (historyContent) {
        const contentToSave = { role: 'assistant', content: historyContent }
        await this.saveHistory(userId, [contentToSave] as ChatMessage[], true)
      }

      await sendWhatsAppMessage(userId, responseText)
    } catch (error) {
      console.error('[GenericContextService] Erro ao processar mensagem:', error)
      await sendWhatsAppMessage(userId, 'Ops! Tive um problema para processar sua mensagem. Pode tentar de novo?')
    }
  }
}
