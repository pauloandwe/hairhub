import { getFarmNameForPhone, getUserContextSync } from '../env.config'
import { FlowTypeTranslation, FlowStep } from '../enums/generic.enum'

export function buildAssistantTitle(farmName: string, flowType?: string, flowStep?: string): string {
  if (flowType && flowStep) {
    const typeTranslation = FlowTypeTranslation[flowType as keyof typeof FlowTypeTranslation]

    if (flowStep === FlowStep.Creating && typeTranslation) {
      const titleText = farmName ? `Lançamento de ${typeTranslation} - ${farmName}` : `Lançamento de ${typeTranslation}`
      return `*${titleText}*`
    }

    if (flowStep === FlowStep.Editing && typeTranslation) {
      const titleText = farmName ? `Edição de ${typeTranslation} - ${farmName}` : `Edição de ${typeTranslation}`
      return `*${titleText}*`
    }
  }

  if (farmName) {
    return `*Assistente Inttegra - ${farmName}*`
  }

  return '*Assistente Inttegra*'
}

export function stripAssistantTitle(text: string): string {
  if (!text) return text
  return text.replace(/^(\*?(?:Assistente Inttegra|Lançamento de|Edição de)\s*(?:de\s+)?[^\n]*\*?\n)+/i, '')
}

export function sanitizeOutgoingText(text: string): string {
  if (!text) return text as any
  let out = text
  out = out.replace(/```[\s\S]*?```/g, '')
  out = out
    .split('\n')
    .filter((line) => !/^\s*[\[{].*[\]}]\s*$/.test(line.trim()))
    .join('\n')
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}

export function formatAssistantReply(aiText: string, farmName?: string, flowType?: string, flowStep?: string): { display: string; history: string } {
  const FALLBACK = 'Ops! Tive um problema para processar sua mensagem. Pode tentar de novo?'

  const content = stripAssistantTitle(aiText)
  const sanitized = sanitizeOutgoingText(content)

  return {
    display: withAssistantTitle(sanitized || FALLBACK, farmName, flowType, flowStep),
    history: sanitized,
  }
}

export function withAssistantTitle(text: string, farmName?: string, flowType?: string, flowStep?: string): string {
  const sanitized = sanitizeOutgoingText(text)
  if (!farmName && !flowType) return sanitized

  const title = buildAssistantTitle(farmName || '', flowType, flowStep)
  return `${title}\n${sanitized}`.trim()
}

export function withAssistantTitlePhone(text: string, phone: string): string {
  const farmName = getFarmNameForPhone(phone)
  const userContext = getUserContextSync(phone)
  const flowType = userContext?.activeRegistration?.type
  const flowStep = userContext?.activeRegistration?.step

  return withAssistantTitle(text, farmName, flowType, flowStep)
}
