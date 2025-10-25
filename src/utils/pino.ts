import pino from 'pino'
import { env } from 'process'

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() }
    },
  },
})

export const aiLogger = logger.child({ module: 'AI' })
export const whatsappLogger = logger.child({ module: 'WhatsApp' })
export const dbLogger = logger.child({ module: 'Database' })
export const systemLogger = logger.child({ module: 'System' })

export function logOpenAIPrompt(context: string, messages: any[], metadata?: Record<string, any>) {
  aiLogger.debug(
    {
      context,
      promptSize: messages.length,
      lastMessage: messages[messages.length - 1]?.content?.substring(0, 100),
      ...metadata,
    },
    `[OpenAI] Prompt - ${context}`,
  )
}

export function logOpenAIResponse(context: string, response: any, metadata?: Record<string, any>) {
  aiLogger.info(
    {
      context,
      model: response.model,
      finishReason: response.choices?.[0]?.finish_reason,
      hasToolCalls: !!response.choices?.[0]?.message?.tool_calls,
      toolCallsCount: response.choices?.[0]?.message?.tool_calls?.length || 0,
      responsePreview: response.choices?.[0]?.message?.content?.substring(0, 100),
      ...metadata,
    },
    `[OpenAI] Response - ${context}`,
  )
}

export function logToolExecution(toolName: string, result: any, metadata?: Record<string, any>) {
  aiLogger.info(
    {
      toolName,
      hasError: !!result?.error,
      resultPreview: typeof result === 'string' ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100),
      ...metadata,
    },
    `[Tool] Executed - ${toolName}`,
  )
}
