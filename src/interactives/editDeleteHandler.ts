import { registerInteractiveSelectionHandler } from './registry'
import { appendUserTextAuto } from '../services/history-router.service'
import { sendWhatsAppMessage } from '../api/meta.api'

export interface EditDeleteFunctions {
  edit: (args: { phone: string }) => Promise<any>
  delete?: (args: { phone: string }) => Promise<any>
}

export function registerEditDeleteHandler(namespace: string, functions: EditDeleteFunctions) {
  registerInteractiveSelectionHandler(namespace, async ({ userId, value, accepted }) => {
    if (!accepted) {
      await sendWhatsAppMessage(userId, 'Opa, essa opção expirou')
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
        await sendWhatsAppMessage(userId, 'Essa opção não está disponível.')
        return
      }
      await functions.delete({ phone: userId })
      return
    }
  })
}
