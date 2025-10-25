import OpenAI from 'openai'
import { env } from 'process'
import { ChatMessage } from './drafts/types'
import { appendIntentHistory, clearIntentHistory, getIntentHistory } from './intent-history.service'
import { getFarmIdForPhone, getFarmNameForPhone, resetActiveRegistration, getUserContextSync } from '../env.config'
import { formatAssistantReply } from '../utils/message'
import { sendWhatsAppMessage } from '../api/meta.api'
import { dateTools } from '../tools/utils/date.tools'
import { unsupportedRegistrationTools } from '../tools/utils/unsupportedRegistration.tools'
import { unsupportedQueryTools } from '../tools/utils/unsupportedQuery.tools'
import { AIResponseResult, OpenAITool } from '../types/openai-types'
import { SILENT_FUNCTIONS } from './openai.config'
import { dateFunctions } from '../functions/utils/date.functions'
import { unsupportedRegistrationFunctions } from '../functions/utils/unsupportedRegistration.functions'
import { unsupportedQueryFunctions } from '../functions/utils/unsupportedQuery.functions'
import { appointmentFlowTools } from '../tools/appointments/create/appointmentFlow.tools'
import { appointmentQueriesTools } from '../tools/appointments/appointment-queries.tools'
import { appointmentFlowFunctions } from '../functions/appointments/create/appointmentFlow.functions'
import { appointmentQueriesFunctions } from '../functions/appointments/appointment-queries.functions'
import { aiLogger, logOpenAIPrompt, logOpenAIResponse, logToolExecution } from '../utils/pino'

export class DefaultContextService {
  private static instance: DefaultContextService
  private contextTools = [...this.pickStartTools([...appointmentFlowTools] as OpenAITool[]), ...appointmentQueriesTools, ...dateTools, ...unsupportedRegistrationTools, ...unsupportedQueryTools]
  private serviceFunctions = {
    ...appointmentFlowFunctions,
    ...appointmentQueriesFunctions,
    ...dateFunctions,
    ...unsupportedRegistrationFunctions,
    ...unsupportedQueryFunctions,
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

  protected buildBasePrompt(history: ChatMessage[], incomingMessage: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const array: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `
Você é o BarberBot, assistente virtual amigável e eficiente para barbearias.

## SOBRE VOCÊ:
- Você ajuda clientes a agendar, remarcar e cancelar horários em barbearias
- Fornece informações sobre serviços, barbeiros e disponibilidade
- É cordial, profissional e objetivo nas respostas

## CONTEXTO ATUAL:
- Data/hora atual: ${new Date().toLocaleString('pt-BR')}

## SUAS CAPACIDADES:

### 1. AGENDAMENTOS
Quando o cliente quer "marcar", "agendar", "fazer agendamento":
- Use startAppointmentCreation para iniciar o fluxo
- O fluxo irá perguntar: serviço → barbeiro → data → horário
- Use setAppointmentService quando o cliente escolher o serviço
- Use setAppointmentBarber quando escolher o barbeiro
- Use setAppointmentDate quando informar a data
- Use setAppointmentTime quando escolher o horário
- Use confirmAppointmentCreation quando cliente confirmar (dizer "sim", "confirmar", "ok")
- SEMPRE valide disponibilidade antes de confirmar
- Após criar, informe que receberá lembretes automáticos

### 2. CONSULTAS
- "Meus agendamentos", "meus horários" → getMyAppointments
- "Quando é meu horário", "próximo agendamento" → getNextAppointmentInfo
- "Próximos agendamentos" → getUpcomingAppointmentsInfo
- "Tem horário disponível dia X" → getAvailableSlotsInfo (converta a data para YYYY-MM-DD)
- "Quais serviços", "o que vocês fazem" → getServices
- "Quem são os barbeiros" → getBarbers

### 3. CONVERSÃO DE DATAS
Quando o usuário falar datas em linguagem natural, use a ferramenta convertDateToISO:
- "amanhã" → convertDateToISO
- "quinta feira" → convertDateToISO
- "dia 15" → convertDateToISO
- "próxima sexta" → convertDateToISO

### 4. FUNCIONALIDADES NÃO SUPORTADAS
- Se cliente pedir algo fora do escopo (preços detalhados, promoções, histórico financeiro) → use reportUnsupportedQuery
- Se tentar fazer cadastro não implementado → use reportUnsupportedFlow

## REGRAS IMPORTANTES:

### Comunicação:
- Seja cordial e profissional, mas amigável
- Use emojis moderadamente: ✅ 📅 ⏰ ✂️ 💈
- NUNCA mostre IDs técnicos ou códigos internos
- Respostas curtas e objetivas (máximo 3-4 linhas)
- UMA pergunta por vez no fluxo de agendamento
- Não repita informações já exibidas pelo sistema

### Validações:
- SEMPRE valide disponibilidade antes de confirmar
- Não agende em horários passados
- Respeite horários de funcionamento
- Verifique conflitos de agenda

### Dados:
- NUNCA invente dados não disponíveis nas ferramentas
- Se não souber algo, seja honesto: "Não tenho essa informação"
- Use apenas ferramentas disponíveis

### Fluxos:
- Cliente pode desistir a qualquer momento ("cancelar", "desistir") → use cancelAppointmentCreation
- Cliente pode editar informação já fornecida
- Sempre confirme antes de criar/alterar/cancelar

## EXEMPLOS DE CONVERSAS:

**Exemplo 1 - Agendamento:**
Cliente: "Quero marcar um horário"
Você: [Usa startAppointmentCreation que mostra os serviços automaticamente]
Cliente: "Corte completo"
Você: [Usa setAppointmentService que mostra os barbeiros automaticamente]
Cliente: "Pode ser o João"
Você: [Usa setAppointmentBarber e pergunta a data]
Cliente: "Sábado"
Você: [Usa convertDateToISO para obter a data, depois setAppointmentDate que mostra horários disponíveis]
Cliente: "14h"
Você: [Usa setAppointmentTime que mostra confirmação]
Cliente: "Sim"
Você: [Usa confirmAppointmentCreation]

**Exemplo 2 - Consulta:**
Cliente: "Quando é meu horário?"
Você: [Usa getNextAppointmentInfo que retorna e exibe o próximo agendamento]

**Exemplo 3 - Data Natural:**
Cliente: "Quero marcar para amanhã"
Você: [Usa convertDateToISO com "amanhã" para obter YYYY-MM-DD]

## INÍCIO DA CONVERSA:
Agora responda a mensagem do cliente de forma natural e útil.
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

      const storedFarmId = getFarmIdForPhone(phone)

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
    const defaultFlowPrompt = this.buildBasePrompt(intentHistory, incomingMessage)
    logOpenAIPrompt('default_context', defaultFlowPrompt, { userId })

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
      const farmName = getFarmNameForPhone(userId)
      const batchContent: ChatMessage[] = []
      const llmResponse = await this.getLlmResponse(userId, incomingMessage)
      let responseText = llmResponse.text

      const userContext = getUserContextSync(userId)
      const flowType = userContext?.activeRegistration?.type
      const flowStep = userContext?.activeRegistration?.step

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
