import OpenAI from 'openai'
import { env } from '../../env.config'
import { openAIModelConfig } from '../../config/openai-model.config'

const CLIENT_NAME_WAIT_WINDOW_MS = 15_000

type ExpireHandler = () => Promise<void> | void

export class ClientNameCaptureService {
  private static instance: ClientNameCaptureService
  private readonly openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  })
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>()

  static getInstance(): ClientNameCaptureService {
    if (!ClientNameCaptureService.instance) {
      ClientNameCaptureService.instance = new ClientNameCaptureService()
    }
    return ClientNameCaptureService.instance
  }

  getWaitWindowMs(): number {
    return CLIENT_NAME_WAIT_WINDOW_MS
  }

  clearPendingSecondMessageTimer(userId: string): void {
    const existingTimer = this.pendingTimers.get(userId)
    if (!existingTimer) return

    clearTimeout(existingTimer)
    this.pendingTimers.delete(userId)
  }

  schedulePendingSecondMessageTimer(userId: string, onExpire: ExpireHandler): void {
    this.clearPendingSecondMessageTimer(userId)

    const timeout = setTimeout(() => {
      this.pendingTimers.delete(userId)
      this.safeRun(onExpire)
    }, CLIENT_NAME_WAIT_WINDOW_MS)

    this.pendingTimers.set(userId, timeout)
  }

  async extractName(messages: string[]): Promise<string | null> {
    const sanitizedMessages = messages.map((message) => (typeof message === 'string' ? message.trim() : '')).filter((message) => message.length > 0)

    if (sanitizedMessages.length === 0) {
      return null
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              'Você extrai apenas o nome do próprio cliente a partir de mensagens curtas de WhatsApp.',
              'Retorne SOMENTE JSON válido no formato {"name": string | null}.',
              'Use string apenas quando houver autoidentificação clara do cliente.',
              'Retorne null se houver ambiguidade, ausência de nome, múltiplas pessoas, pedido de serviço sem identificação, ou se o nome mencionado puder ser barbeiro, estabelecimento ou serviço.',
              'Exemplos válidos: "Paulo", "me chamo Paulo", "sou o Paulo", "Paulo André".',
              'Não invente sobrenome e não explique sua decisão.',
            ].join(' '),
          },
          {
            role: 'user',
            content: sanitizedMessages.map((message, index) => `Mensagem ${index + 1}: ${message}`).join('\n'),
          },
        ],
      })

      const rawContent = response.choices?.[0]?.message?.content
      const content = this.extractTextContent(rawContent)
      if (!content) {
        return null
      }

      const parsed = this.parseJsonPayload(content)
      const candidate = typeof parsed?.name === 'string' ? parsed.name.trim() : null

      return candidate && candidate.length > 0 ? candidate : null
    } catch (error: any) {
      console.error('[ClientNameCaptureService] Error extracting client name with AI:', {
        model: openAIModelConfig.OPENAI_AGENT_FLOW_MODEL,
        code: error?.code ?? error?.error?.code ?? null,
        param: error?.param ?? error?.error?.param ?? null,
        message: error?.message ?? error?.error?.message ?? 'Unknown error',
      })
      return null
    }
  }

  private parseJsonPayload(content: string): Record<string, unknown> | null {
    const trimmed = content.trim()
    const withoutCodeFence = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
    const objectStart = withoutCodeFence.indexOf('{')
    const objectEnd = withoutCodeFence.lastIndexOf('}')
    const candidate = objectStart >= 0 && objectEnd >= objectStart ? withoutCodeFence.slice(objectStart, objectEnd + 1) : withoutCodeFence

    try {
      return JSON.parse(candidate) as Record<string, unknown>
    } catch (error) {
      console.error('[ClientNameCaptureService] Invalid JSON returned by name extractor:', {
        content,
        error,
      })
      return null
    }
  }

  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }

    if (!Array.isArray(content)) {
      return ''
    }

    return (content as Array<{ text?: string }>)
      .map((chunk: { text?: string }) => {
        if (chunk && typeof chunk === 'object' && 'text' in chunk && typeof chunk.text === 'string') {
          return chunk.text
        }
        return ''
      })
      .join('\n')
      .trim()
  }

  private safeRun(callback: ExpireHandler): void {
    try {
      const maybePromise = callback()
      if (this.isPromiseLike(maybePromise)) {
        maybePromise.catch((error: unknown) => {
          console.error('[ClientNameCaptureService] Error while handling name capture timeout:', error)
        })
      }
    } catch (error) {
      console.error('[ClientNameCaptureService] Error while executing name capture timeout handler:', error)
    }
  }

  private isPromiseLike(value: unknown): value is Promise<unknown> {
    return typeof value === 'object' && value !== null && 'then' in value && typeof (value as any).then === 'function'
  }
}

export const clientNameCaptureService = ClientNameCaptureService.getInstance()
