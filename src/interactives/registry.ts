import { parseNamespacedId, consumePendingListInteraction } from '../utils/interactive'

export interface InteractiveSelectionContext {
  userId: string
  messageId: string
  namespace: string
  value: string
  accepted: boolean
}

export type InteractiveSelectionHandler = (ctx: InteractiveSelectionContext) => Promise<void>

const handlers: Record<string, InteractiveSelectionHandler> = {}

export function registerInteractiveSelectionHandler(namespace: string, handler: InteractiveSelectionHandler) {
  handlers[namespace] = handler
}

export async function handleIncomingInteractiveList(userId: string, messageId: string, replyId?: string): Promise<boolean> {
  const parsed = parseNamespacedId(replyId)
  if (!parsed) return false
  const handler = handlers[parsed.namespace]
  if (!handler) return false
  const consume = consumePendingListInteraction(userId, parsed.namespace, parsed.value)
  await handler({
    userId,
    messageId,
    namespace: parsed.namespace,
    value: parsed.value,
    accepted: consume.accepted,
  })
  return true
}
