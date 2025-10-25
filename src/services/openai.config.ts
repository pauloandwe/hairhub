import OpenAI from 'openai'
import { allFunctions } from '../functions'
import { FlowType } from '../enums/generic.enum'
import { AIResponseResult } from '../types/openai-types'

export const SILENT_FUNCTIONS = new Set<string>([
  'startAppointmentCreation',
  'setAppointmentService',
  'setAppointmentBarber',
  'setAppointmentDate',
  'setAppointmentTime',
  'confirmAppointmentCreation',
  'cancelAppointmentCreation',
])

export const CONTEXT_FUNCTIONS = new Set<string>([])

export type FlowConfig = { allowedFunctions: string[]; startFunction?: string; changeFunction?: string; editFunction?: string; cancelFunction?: string }

export function resolveFlowConfig(type?: string): FlowConfig | undefined {
  if (!type) return undefined

  const known: Record<FlowType, FlowConfig> = {
    [FlowType.AppointmentCreate]: {
      allowedFunctions: [
        'startAppointmentCreation',
        'setAppointmentService',
        'setAppointmentBarber',
        'setAppointmentDate',
        'setAppointmentTime',
        'confirmAppointmentCreation',
        'cancelAppointmentCreation',
      ],
      startFunction: 'startAppointmentCreation',
      cancelFunction: 'cancelAppointmentCreation',
    },
    [FlowType.AppointmentReschedule]: {
      allowedFunctions: [],
      startFunction: undefined,
    },
    [FlowType.AppointmentCancel]: {
      allowedFunctions: [],
      startFunction: undefined,
    },
  }

  if (known[type as FlowType]) return known[type as FlowType]

  const fnNames = Object.keys(allFunctions || {})
  const lowerType = String(type).toLowerCase()
  const allowed = fnNames.filter((n) => n.toLowerCase().includes(lowerType))
  const start = allowed.find((n) => n.toLowerCase().startsWith('start')) || allowed[0]
  return { allowedFunctions: allowed, startFunction: start }
}

export function handleSilentFunctions(pendingToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[], toolResponses: any[]): AIResponseResult | null {
  try {
    for (let i = 0; i < pendingToolCalls.length; i++) {
      const tc = pendingToolCalls[i]
      if (tc.type === 'function' && SILENT_FUNCTIONS.has(tc.function.name)) {
        const tr = toolResponses[i]
        const raw = tr?.content
        let parsed
        try {
          parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        } catch {}
        const err = parsed?.error
        if (err) {
          const msg = typeof err === 'string' ? err : JSON.stringify(err)
          return { text: msg, suppress: false }
        }
      }
    }
  } catch (e) {
    console.warn('Falha ao verificar erros de funções silenciosas:', e)
  }

  const usedSilentFunction = pendingToolCalls.some((tc) => tc.type === 'function' && SILENT_FUNCTIONS.has(tc.function.name))
  if (usedSilentFunction) {
    return { text: '', suppress: true }
  }

  return null
}
