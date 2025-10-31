import OpenAI from 'openai'
import { allFunctions } from '../functions'
import { FlowType } from '../enums/generic.enum'
import { AIResponseResult } from '../types/openai-types'

export const SILENT_FUNCTIONS = new Set<string>([
  'changeAnimalDeathRegistrationField',
  'startAnimalDeathRegistration',
  'startAnimalBirthRegistration',
  'cancelAnimalDeathRegistration',
  'confirmAnimalDeathRegistration',
  'changeAnimalBirthRegistrationField',
  'cancelAnimalBirthRegistration',
  'confirmAnimalBirthRegistration',
  'listInstitutions',
  'listFarms',
  'startExpenseRegistration',
  'changeSimplifiedExpenseRegistration',
  'confirmSimpleExpenseRegistration',
  'cancelSimplifiedExpenseRegistration',
  'editDeathRecordField',
  'editBirthRecordField',
  'editExpenseRecordField',
  'startSaleRegistration',
  'changeSaleRegistrationField',
  'confirmSaleRegistration',
  'cancelSaleRegistration',
  'editSaleRecordField',
  'deleteSaleRegistration',
  'startPurchaseRegistration',
  'changePurchaseRegistrationField',
  'confirmPurchaseRegistration',
  'cancelPurchaseRegistration',
  'editPurchaseRecordField',
  'deletePurchaseRegistration',
  'changeAppointmentRegistrationField',
  'startAppointmentRegistration',
  'cancelAppointmentRegistration',
  'confirmAppointmentRegistration',
  'editAppointmentRecordField',
  'deleteAppointmentRegistration',
  'startAppointmentReschedule',
  'changeAppointmentRescheduleField',
  'confirmAppointmentReschedule',
  'editAppointmentRescheduleField',
  'cancelAppointmentReschedule',
])

export const CONTEXT_FUNCTIONS = new Set<string>(['listInstitutions', 'listFarms'])

export type FlowConfig = { allowedFunctions: string[]; startFunction?: string; changeFunction?: string; editFunction?: string; cancelFunction?: string }

export function resolveFlowConfig(type?: string): FlowConfig | undefined {
  if (!type) return undefined

  const known: Record<FlowType, FlowConfig> = {
    [FlowType.Death]: {
      allowedFunctions: ['startAnimalDeathRegistration', 'changeAnimalDeathRegistrationField', 'confirmAnimalDeathRegistration', 'cancelAnimalDeathRegistration', 'editDeathRecordField'],
      startFunction: 'startAnimalDeathRegistration',
      changeFunction: 'changeAnimalDeathRegistrationField',
      editFunction: 'editDeathRecordField',
      cancelFunction: 'cancelAnimalDeathRegistration',
    },
    [FlowType.Purchase]: {
      allowedFunctions: ['startPurchaseRegistration', 'changePurchaseRegistrationField', 'confirmPurchaseRegistration', 'cancelPurchaseRegistration', 'editPurchaseRecordField', 'deletePurchaseRegistration'],
      startFunction: 'startPurchaseRegistration',
      changeFunction: 'changePurchaseRegistrationField',
      editFunction: 'editPurchaseRecordField',
      cancelFunction: 'cancelPurchaseRegistration',
    },
    [FlowType.Birth]: {
      allowedFunctions: ['startAnimalBirthRegistration', 'changeAnimalBirthRegistrationField', 'confirmAnimalBirthRegistration', 'cancelAnimalBirthRegistration', 'editBirthRecordField'],
      startFunction: 'startAnimalBirthRegistration',
      changeFunction: 'changeAnimalBirthRegistrationField',
      editFunction: 'editBirthRecordField',
      cancelFunction: 'cancelAnimalBirthRegistration',
    },
    [FlowType.SimplifiedExpense]: {
      allowedFunctions: ['startExpenseRegistration', 'changeSimplifiedExpenseRegistration', 'confirmSimpleExpenseRegistration', 'cancelSimplifiedExpenseRegistration', 'editExpenseRecordField'],
      startFunction: 'startExpenseRegistration',
      changeFunction: 'changeSimplifiedExpenseRegistration',
      editFunction: 'editExpenseRecordField',
      cancelFunction: 'cancelSimplifiedExpenseRegistration',
    },
    [FlowType.Selling]: {
      allowedFunctions: ['startSaleRegistration', 'changeSaleRegistrationField', 'confirmSaleRegistration', 'cancelSaleRegistration', 'editSaleRecordField', 'deleteSaleRegistration'],
      startFunction: 'startSaleRegistration',
      changeFunction: 'changeSaleRegistrationField',
      editFunction: 'editSaleRecordField',
      cancelFunction: 'cancelSaleRegistration',
    },
    [FlowType.Appointment]: {
      allowedFunctions: ['startAppointmentRegistration', 'changeAppointmentRegistrationField', 'confirmAppointmentRegistration', 'cancelAppointmentRegistration', 'editAppointmentRecordField', 'deleteAppointmentRegistration'],
      startFunction: 'startAppointmentRegistration',
      changeFunction: 'changeAppointmentRegistrationField',
      editFunction: 'editAppointmentRecordField',
      cancelFunction: 'cancelAppointmentRegistration',
    },
    [FlowType.AppointmentReschedule]: {
      allowedFunctions: ['startAppointmentReschedule', 'changeAppointmentRescheduleField', 'confirmAppointmentReschedule', 'cancelAppointmentReschedule', 'editAppointmentRescheduleField'],
      startFunction: 'startAppointmentReschedule',
      changeFunction: 'changeAppointmentRescheduleField',
      editFunction: 'editAppointmentRescheduleField',
      cancelFunction: 'cancelAppointmentReschedule',
    },
  }

  if (known[type as FlowType]) return known[type as FlowType]

  const fnNames = Object.keys(allFunctions || {})
  const lowerType = String(type).toLowerCase()
  const allowed = fnNames.filter((n) => n.toLowerCase().includes(lowerType) && n.toLowerCase().includes('registration'))
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
