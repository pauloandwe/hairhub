import { registerInteractiveSelectionHandler } from './registry'
import { appendUserTextAuto } from '../services/history-router.service'
import { sendWhatsAppMessage } from '../api/meta.api'
import { getInteractiveCopy } from '../utils/conversation-copy'

export interface EditDeleteFunctions {
  edit: (args: { phone: string }) => Promise<any>
  delete?: (args: { phone: string }) => Promise<any>
}

export function registerEditDeleteHandler(namespace: string, functions: EditDeleteFunctions) {
  registerInteractiveSelectionHandler(namespace, async ({ userId, value, accepted }) => {
    if (!accepted) {
      await sendWhatsAppMessage(userId, getInteractiveCopy('expiredOption'))
      return
    }

    if (value === 'EDIT') {
      await appendUserTextAuto(userId, 'Editar')
      await functions.edit({ phone: userId })
      return
    }

    if (value === 'DELETE') {
      await appendUserTextAuto(userId, 'Excluir')
      if (!functions.delete) {
        await sendWhatsAppMessage(userId, getInteractiveCopy('notAvailable'))
        return
      }
      await functions.delete({ phone: userId })
      return
    }
  })
}
