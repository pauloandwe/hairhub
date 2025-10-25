import OpenAI from 'openai'
import { getUserContext } from '../env.config'
import { draftHistoryService } from './drafts/draft-history'

export type RouterChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

export async function appendHistoryAuto(userId: string, messages: RouterChatMessage[]): Promise<void> {
  if (!messages?.length) return
  const inRegistration = !!(await getUserContext(userId))?.activeRegistration?.type

  if (inRegistration) {
    await draftHistoryService.appendActiveDraftHistory(userId, messages)
  }
}

export async function appendUserTextAuto(userId: string, text: string): Promise<void> {
  if (!text) return
  await appendHistoryAuto(userId, [{ role: 'user', content: text }])
}

export async function appendAssistantTextAuto(userId: string, text: string): Promise<void> {
  if (!text) return
  await appendHistoryAuto(userId, [{ role: 'assistant', content: text }])
}
