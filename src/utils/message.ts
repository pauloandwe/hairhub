import { getBusinessNameForPhone, getUserContextSync } from '../env.config'
import { FlowStep } from '../enums/generic.enum'

export function buildAssistantTitle(farmName: string, flowType?: string, flowStep?: string): string {
  if (farmName) {
    if (flowType && flowStep === FlowStep.Editing) {
      return `*${farmName}*`
    }

    if (flowType && flowStep === FlowStep.Creating) {
      return `*${farmName}*`
    }

    return `*${farmName}*`
  }

  return ''
}

export function stripAssistantTitle(text: string): string {
  if (!text) return text
  return text
    .replace(/^(\*?(?:Assistente de Business|Novo|Edição de)\s*(?:de\s+)?[^\n]*\*?\n)+/i, '')
    .replace(/^\*[^\n]{2,80}\*\n/, '')
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
  if (!title) return sanitized
  return `${title}\n${sanitized}`.trim()
}

export function withAssistantTitlePhone(text: string, phone: string): string {
  const farmName = getBusinessNameForPhone(phone)
  const userContext = getUserContextSync(phone)
  const flowType = userContext?.activeRegistration?.type
  const flowStep = userContext?.activeRegistration?.step

  return withAssistantTitle(text, farmName, flowType, flowStep)
}
