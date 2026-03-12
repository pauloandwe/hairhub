import OpenAI from 'openai'
import { env } from '../../env.config'
import { OpenAITool } from '../../types/openai-types'
import {
  AppointmentDateInterpretation,
  APPOINTMENT_DATE_INTERPRETATION_KINDS,
  DEFAULT_APPOINTMENT_DATE_LOCALE,
  normalizeAppointmentDateInterpretation,
  RequestedAppointmentDateResolution,
} from '../../utils/appointment-date-resolution'
import { aiLogger } from '../../utils/pino'
import { getAppointmentDateInterpreterPrompt, resolveAppointmentDateInterpreterLocale } from './appointment-date-interpreter.prompts'

export interface InterpretRequestedAppointmentDateParams {
  messageText?: string | null
  locale?: string | null
  timezone?: string | null
  now?: Date
  currentArgs?: {
    appointmentDate?: unknown
    date?: unknown
  }
}

export interface InterpretRequestedAppointmentDateResult {
  interpretation: AppointmentDateInterpretation
  resolution: RequestedAppointmentDateResolution
}

type ChatCompletionsClient = {
  create: (params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming) => Promise<OpenAI.Chat.Completions.ChatCompletion>
}

type OpenAIClientLike = {
  chat: {
    completions: ChatCompletionsClient
  }
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

function buildNeedsClarificationInterpretation(locale?: string | null): AppointmentDateInterpretation {
  return {
    kind: 'needs_clarification',
    locale: resolveAppointmentDateInterpreterLocale(locale),
  }
}

export class AppointmentDateInterpreterService {
  private readonly openai: OpenAIClientLike
  private readonly logger = aiLogger.child({ module: 'appointment-date-interpreter' })

  constructor(openaiClient?: OpenAIClientLike) {
    this.openai =
      openaiClient ||
      new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      })
  }

  async interpretRequestedAppointmentDate(params: InterpretRequestedAppointmentDateParams): Promise<InterpretRequestedAppointmentDateResult> {
    const locale = resolveAppointmentDateInterpreterLocale(params.locale)
    const interpretation = await this.runInterpreter(params, locale)
    const resolution = normalizeAppointmentDateInterpretation({
      interpretation,
      timezone: params.timezone,
      now: params.now,
      source: 'ai_interpreter',
    })

    return {
      interpretation,
      resolution,
    }
  }

  private async runInterpreter(params: InterpretRequestedAppointmentDateParams, locale: string): Promise<AppointmentDateInterpretation> {
    const tools: OpenAITool[] = [
      {
        type: 'function',
        function: {
          name: 'interpret_requested_appointment_date',
          description: 'Interpreta o significado de uma data mencionada em conversa de agendamento.',
          parameters: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: [...APPOINTMENT_DATE_INTERPRETATION_KINDS],
              },
              day: { type: 'integer' },
              month: { type: 'integer' },
              year: { type: 'integer' },
              matchedText: { type: 'string' },
              confidenceNote: { type: 'string' },
              locale: { type: 'string' },
            },
            required: ['kind'],
            additionalProperties: false,
          },
        },
      },
    ]

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: getAppointmentDateInterpreterPrompt(locale),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                locale,
                messageText: normalizeString(params.messageText),
                currentArgs: {
                  appointmentDate: normalizeString(params.currentArgs?.appointmentDate),
                  date: normalizeString(params.currentArgs?.date),
                },
              },
              null,
              2,
            ),
          },
        ],
        tools,
        tool_choice: 'required',
      })

      const toolCall = response.choices[0]?.message?.tool_calls?.[0]
      if (toolCall?.type !== 'function') {
        return buildNeedsClarificationInterpretation(locale)
      }

      const parsed = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>
      const interpretation = this.validateInterpretationPayload(parsed, locale)
      if (!interpretation) {
        return buildNeedsClarificationInterpretation(locale)
      }

      return interpretation
    } catch (error: any) {
      this.logger.error(
        {
          locale,
          messageText: params.messageText,
          currentArgs: params.currentArgs,
          code: error?.code ?? error?.error?.code ?? null,
          message: error?.message ?? error?.error?.message ?? 'Unknown error',
        },
        'Failed to interpret requested appointment date',
      )
      return buildNeedsClarificationInterpretation(locale)
    }
  }

  private validateInterpretationPayload(payload: Record<string, unknown>, locale: string): AppointmentDateInterpretation | null {
    const kind = normalizeString(payload.kind)
    if (!kind || !APPOINTMENT_DATE_INTERPRETATION_KINDS.includes(kind as (typeof APPOINTMENT_DATE_INTERPRETATION_KINDS)[number])) {
      return null
    }

    const interpretation: AppointmentDateInterpretation = {
      kind: kind as AppointmentDateInterpretation['kind'],
      day: normalizeInteger(payload.day),
      month: normalizeInteger(payload.month),
      year: normalizeInteger(payload.year),
      matchedText: normalizeString(payload.matchedText),
      confidenceNote: normalizeString(payload.confidenceNote),
      locale: normalizeString(payload.locale) || locale || DEFAULT_APPOINTMENT_DATE_LOCALE,
    }

    if (interpretation.kind === 'explicit_date' && (!interpretation.day || !interpretation.month || !interpretation.year)) {
      return null
    }

    if (interpretation.kind === 'day_month' && (!interpretation.day || !interpretation.month)) {
      return null
    }

    if (interpretation.kind === 'day_only' && !interpretation.day) {
      return null
    }

    return interpretation
  }
}

export const appointmentDateInterpreterService = new AppointmentDateInterpreterService()
