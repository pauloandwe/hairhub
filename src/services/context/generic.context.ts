import { randomUUID } from 'crypto'
import { sendWhatsAppMessage } from '../../api/meta.api'
import { env, getBusinessIdForPhone, getBusinessNameForPhone, getUserContextSync, resetActiveRegistration, setUserContext, UserRuntimeContext } from '../../env.config'
import { formatAssistantReply } from '../../utils/message'
import { appendIntentHistory, clearIntentHistory, ChatMessage } from '../intent-history.service'
import { draftHistoryService } from '../drafts/draft-history'
import { FlowConfig, SILENT_FUNCTIONS } from '../openai.config'
import OpenAI from 'openai'
import { FlowStep, FlowType, FlowTypeTranslation } from '../../enums/generic.enum'
import { AIResponseResult, OpenAITool } from '../../types/openai-types'

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

  protected async buildBasePrompt(draft: any, history: ChatMessage[], incomingMessage: string, businessName?: string, userId?: string, awaitingField?: string, isEditingExistingRecord?: boolean): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
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
            1. Se o usuário disser "cancelar", "parar", "desistir" ou "não quero mais", use a ferramenta de cancelamento IMEDIATAMENTE;
            2. Extraia APENAS o novo valor que corresponde ao campo "${awaitingField}" da mensagem do usuário;
            3. Normalize o valor conforme necessário (datas em YYYY-MM-DD, números sem símbolos);
            4. Chame a ferramenta de edição com o campo e valor extraído;

            **Regras de CANCELAMENTO (PRIORIDADE MÁXIMA):**
            - Se disser "cancelar", "parar", "desistir", "não quero", "não quero mais" ou "interromper", use a ferramenta de cancelamento
            - Se a mensagem for apenas uma resposta negativa ("não", "não é", "não tenho"), trate-a como resposta para o campo e siga com a extração
            - Não pergunte se quer cancelar, apenas execute
            - Cancelamento tem PRIORIDADE MÁXIMA sobre qualquer outra extração de dados

            **Regras gerais:**
            - Seja direto e objetivo
            - Datas devem estar em formato YYYY-MM-DD
            - Números sem símbolos especiais
            - Não faça perguntas, apenas extraia e execute

            ${businessName ? `Business: ${businessName}` : ''}`,
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
          1. Se o usuário disser "cancelar", "parar", "desistir" ou "não quero mais", use a ferramenta de cancelamento IMEDIATAMENTE;
          2. Extraia APENAS o valor que corresponde ao campo "${awaitingField}" da mensagem do usuário;
          3. Normalize o valor conforme necessário (datas em YYYY-MM-DD, números sem símbolos);
          4. Chame a ferramenta com o valor extraído;

          **Regras de CANCELAMENTO (PRIORIDADE MÁXIMA):**
          - Se disser "cancelar", "parar", "desistir", "não quero", "não quero mais" ou "interromper", use a ferramenta de cancelamento
          - Se a mensagem for apenas uma resposta negativa ("não", "não é", "não tenho"), trate-a como resposta para o campo e siga com a extração
          - Não pergunte se quer cancelar, apenas execute
          - Cancelamento tem PRIORIDADE MÁXIMA sobre qualquer outra extração de dados

          **Regras gerais:**
          - Seja direto e objetivo
          - Datas devem estar em formato YYYY-MM-DD
          - Não faça perguntas, apenas extraia e execute

          ${businessName ? `Business: ${businessName}` : ''}`,
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
        - "sim", "confirmar", "ok": confirmação
        - Frases com intenção clara de cancelar ("cancelar", "parar", "desistir", "não quero", "não quero mais", "interromper"): cancelamento
        - "não" ou negativas ligadas ao campo: trate como resposta para o campo solicitado
        - Datas: sempre normalize para formato ISO (YYYY-MM-DD)
        - Valores monetários: remova "R$" e converta para número

        ${businessName ? `Business: ${businessName}` : ''}

        Não explique, não pergunte. Apenas extraia e chame a ferramenta.`,
      },
      ...history,
      { role: 'user', content: incomingMessage },
    ]
  }

  protected abstract getFlowConfig: () => Required<FlowConfig>
  protected abstract getFunctionToCall: (functionName: string) => any
  protected abstract getDraft: (phone: string) => Promise<TDraft>
  protected abstract getDraftHistory: (userId: string) => Promise<ChatMessage[]>
  protected abstract getTools: () => Promise<OpenAITool[]>

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

  protected handleEditingFlow = async (args: { userId: string; incomingMessage: string; flowConfig: FlowConfig; editingField: string; userContext: UserRuntimeContext }): Promise<AIResponseResult> => {
    const { userId, incomingMessage, flowConfig, editingField, userContext } = args
    const { activeRegistration } = userContext
    const businessName = getBusinessNameForPhone(userId)

    try {
      const editFunctionName = flowConfig?.editFunction
      if (!editFunctionName) {
        console.error(`[State] Flow '${this.flowType}' is active but has no 'editFunction' configured.`)
        await setUserContext(userId, { activeRegistration: { ...activeRegistration, step: FlowStep.Editing, awaitingInputForField: undefined } })
        return { text: 'Houve um problema ao processar sua solicitação. Vamos tentar novamente?', suppress: false }
      }

      await setUserContext(userId, { activeRegistration: { ...activeRegistration, step: FlowStep.Editing, awaitingInputForField: undefined } })

      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)
      console.log(`Handling editing flow for user ${userId}, field: ${editingField}, message: ${incomingMessage}`)
      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)

      const editFieldPrompt = await this.buildBasePrompt({}, [], incomingMessage, businessName, userId, editingField, true)

      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)
      console.log(`editFieldPrompt`, incomingMessage, editFieldPrompt)
      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)

      const openAiAgent = await this.openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: editFieldPrompt,
        tools: await this.getToolsForEditField(),
        tool_choice: 'required',
      })

      const openAiResponse = openAiAgent.choices[0].message
      const agentHasFoundFunctionCall = openAiResponse?.tool_calls?.[0]

      if (!agentHasFoundFunctionCall) {
        await sendWhatsAppMessage(userId, 'Não consegui entender, vamos tentar novamente?')
        return { text: '', suppress: true }
      }

      const toolResponse = await this.executeToolFunction(agentHasFoundFunctionCall, userId)

      if (agentHasFoundFunctionCall.type === 'function' && agentHasFoundFunctionCall.function.name === flowConfig.cancelFunction) {
        console.log(`[GenericContext] Cancelamento de edição detectado para ${this.flowType}`)
        return { text: '', suppress: true }
      }

      try {
        const parsedToolResponse = JSON.parse(toolResponse.content)
        if (!parsedToolResponse?.error) {
          await clearIntentHistory(userId, this.flowType)
          console.log(`[GenericContext] Histórico da intenção "${this.flowType}" limpo após edição bem-sucedida`)
        }
      } catch (err) {
        console.warn(`[GenericContext] Erro ao parsear resposta da tool para verificar limpeza de histórico:`, err)
      }

      return { text: '', suppress: true }
    } catch (error) {
      await setUserContext(userId, { activeRegistration: { ...activeRegistration, step: FlowStep.Editing, awaitingInputForField: undefined } })
      console.error('[GenericContextService] Erro ao processar edição:', error)
      return { text: 'Houve um problema ao processar sua solicitação. Vamos tentar novamente?', suppress: false }
    }
  }

  protected handleCreationFieldFlow = async (args: { userId: string; incomingMessage: string; flowConfig: FlowConfig; awaitingField: string; userContext: UserRuntimeContext }): Promise<AIResponseResult> => {
    const { userId, incomingMessage, flowConfig, awaitingField, userContext } = args
    const { activeRegistration } = userContext

    try {
      await setUserContext(userId, { activeRegistration: { ...activeRegistration, step: FlowStep.Creating, awaitingInputForField: undefined } })

      const defaultFlowPrompt = await this.buildBasePrompt({}, [], incomingMessage, undefined, userId, awaitingField, true)

      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)
      console.log(`defaultFlowPrompt awaitingField`, awaitingField, defaultFlowPrompt)
      console.log(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)

      const openAiAgent = await this.openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: defaultFlowPrompt,
        tools: await this.getToolsForField(),
        tool_choice: 'required',
      })

      const openAiResponse = openAiAgent.choices[0].message
      const agentHasFoundFunctionCall = openAiResponse?.tool_calls?.[0]

      if (!agentHasFoundFunctionCall) {
        const messageInvalidResponse = 'Não consegui entender, vamos tentar novamente?'
        await sendWhatsAppMessage(userId, messageInvalidResponse)
        return { text: '', suppress: true }
      }

      const toolResponse = await this.executeToolFunction(agentHasFoundFunctionCall, userId)

      if (agentHasFoundFunctionCall.type === 'function' && agentHasFoundFunctionCall.function.name === flowConfig.cancelFunction) {
        console.log(`[GenericContext] Cancelamento de cadastro detectado durante field collection para ${this.flowType}`)
        return {
          text: '',
          suppress: true,
        }
      }

      try {
        const parsedToolResponse = JSON.parse(toolResponse.content)
        if (!parsedToolResponse?.error) {
          await clearIntentHistory(userId, this.flowType)
          console.log(`[GenericContext] Histórico da intenção \"${this.flowType}\" limpo após field collection`)
        }
      } catch (err) {
        console.warn(`[GenericContext] Erro ao parsear resposta da tool para verificar limpeza de histórico:`, err)
      }

      return {
        text: '',
        suppress: true,
      }
    } catch (error) {
      await setUserContext(userId, { activeRegistration: { ...activeRegistration, step: FlowStep.Creating, awaitingInputForField: undefined } })
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

    const openAiAgent = await this.openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: defaultFlowPrompt,
      tools: await this.getTools(),
      tool_choice: 'required',
    })
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

    const toolResponse = await this.executeToolFunction(agentHasFoundFunctionCall, userId)

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
