import OpenAI from 'openai'

export interface IdNameRef {
  id: string | null
  name: string | null
}

export type PartialIdNameRef = Partial<IdNameRef> | null | undefined

export type ChatDraftType = string

export type FunctionType = 'appendDeathDraftHistory' | 'removeDeathDraftHistory'

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

export interface ChatDraftEnvelope<T = any> {
  type: ChatDraftType
  history: ChatMessage[]
  payload: T
  sessionId?: string
}

export interface GenericDraftStoreOptions<T> {
  type: string
  emptyDraft: () => T
  keyPrefix?: string
  ttlEnvVar?: string
  defaultTtlSec?: number
}

export type ChangeResponse = { message: string; interactive: boolean }
export type DraftHistoryFunction = (args: { userId: string; messages: ChatMessage[] }) => Promise<void>
export type RemoveDraftHistoryFunction = (args: { userId: string; contentToRemove: string }) => Promise<boolean>
