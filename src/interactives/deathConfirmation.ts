import { sendWhatsAppMessage, sendWhatsAppInteractiveButtons } from '../api/meta.api'
import { buildNamespacedId, registerPendingListInteraction } from '../utils/interactive'
import { registerInteractiveSelectionHandler } from './registry'
import { loadDeathDraft } from '../services/livestocks/death-draft.service'
import { deathFunctions } from '../functions/livestocks/death/death.functions'
import { appendUserTextAuto } from '../services/history-router.service'

export const DEATH_CONFIRM_NAMESPACE = 'DEATH_CONFIRM'

export async function sendDeathConfirmationButtons(userId: string, summaryText?: string) {
  if (summaryText) {
    await sendWhatsAppMessage(userId, summaryText)
  }

  const confirmId = buildNamespacedId(DEATH_CONFIRM_NAMESPACE, 'CONFIRM')
  const cancelId = buildNamespacedId(DEATH_CONFIRM_NAMESPACE, 'CANCEL')

  await sendWhatsAppInteractiveButtons({
    to: userId,
    body: 'Tudo pronto pra confirmar?',
    buttons: [
      { id: confirmId, title: 'Confirmar' },
      { id: cancelId, title: 'Cancelar' },
    ],
  })

  registerPendingListInteraction({
    userId,
    type: 'confirmDeathRegistration',
    namespace: DEATH_CONFIRM_NAMESPACE,
    ids: ['CONFIRM', 'CANCEL'],
  })
}

registerInteractiveSelectionHandler(DEATH_CONFIRM_NAMESPACE, async ({ userId, value, accepted }) => {
  if (!accepted) {
    await sendWhatsAppMessage(userId, 'Opa, essa opção expirou')
    const draft = await loadDeathDraft(userId)
    if (!draft || !draft.quantity) {
      return
    }
    await sendDeathConfirmationButtons(userId)
    return
  }

  if (value === 'CONFIRM') {
    await appendUserTextAuto(userId, 'Confirmar')
    await deathFunctions.confirmAnimalDeathRegistration({ phone: userId })
    return
  }
  if (value === 'CANCEL') {
    await appendUserTextAuto(userId, 'Cancelar')
    await deathFunctions.cancelAnimalDeathRegistration({ phone: userId })
    return
  }
})
