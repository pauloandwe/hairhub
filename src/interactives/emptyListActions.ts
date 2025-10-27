import { sendWhatsAppInteractiveButtons, sendWhatsAppMessage } from '../api/meta.api'
import { appendUserTextAuto } from '../services/history-router.service'
import { buildNamespacedId, registerPendingListInteraction } from '../utils/interactive'
import { cancelActiveRegistration } from './followup'
import { UiDefaults } from './types'

export const EMPTY_LIST_RETRY_ACTION = 'EMPTY_RETRY'
export const EMPTY_LIST_CANCEL_ACTION = 'EMPTY_CANCEL'
export const EMPTY_LIST_BUTTON_BODY = 'Não encontrei opções agora. Quer tentar novamente ou cancelar o cadastro?'
export const EMPTY_LIST_RETRY_LABEL = 'Listar novamente'
export const EMPTY_LIST_CANCEL_LABEL = 'Cancelar cadastro'

interface EmptyListActionsParams {
  userId: string
  namespace: string
  type: string
  emptyMessage: string
  ui: UiDefaults
}

interface HandleEmptyListActionParams {
  userId: string
  value: string
  accepted: boolean
  onRetry: () => Promise<void>
}

export async function sendEmptyListActions({ userId, namespace, type, emptyMessage, ui }: EmptyListActionsParams) {
  await sendWhatsAppMessage(userId, emptyMessage)

  await sendWhatsAppInteractiveButtons({
    to: userId,
    header: ui.header,
    footer: ui.footer ?? 'Inttegra Assistente',
    body: EMPTY_LIST_BUTTON_BODY,
    buttons: [
      { id: buildNamespacedId(namespace, EMPTY_LIST_RETRY_ACTION), title: EMPTY_LIST_RETRY_LABEL },
      { id: buildNamespacedId(namespace, EMPTY_LIST_CANCEL_ACTION), title: EMPTY_LIST_CANCEL_LABEL },
    ],
  })

  registerPendingListInteraction({
    userId,
    type,
    namespace,
    ids: [EMPTY_LIST_RETRY_ACTION, EMPTY_LIST_CANCEL_ACTION],
  })
}

export async function handleEmptyListAction({ userId, value, accepted, onRetry }: HandleEmptyListActionParams): Promise<boolean> {
  if (value !== EMPTY_LIST_RETRY_ACTION && value !== EMPTY_LIST_CANCEL_ACTION) {
    return false
  }

  if (!accepted) {
    await sendWhatsAppMessage(userId, 'Opa, essa opção expirou')
    if (value === EMPTY_LIST_RETRY_ACTION) {
      await onRetry()
    }
    return true
  }

  if (value === EMPTY_LIST_RETRY_ACTION) {
    await appendUserTextAuto(userId, EMPTY_LIST_RETRY_LABEL)
    await onRetry()
    return true
  }

  await appendUserTextAuto(userId, EMPTY_LIST_CANCEL_LABEL)
  await cancelActiveRegistration(userId)
  return true
}
