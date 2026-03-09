import { sendWhatsAppInteractiveButtons, sendWhatsAppMessage } from '../api/meta.api'
import { buildNamespacedId, registerPendingListInteraction } from '../utils/interactive'
import { systemLogger } from '../utils/pino'
import { getInteractiveCopy } from '../utils/conversation-copy'
import { registerInteractiveSelectionHandler } from './registry'

type ConfirmationOptions = {
  namespace: string
  userId: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  summaryText?: string
  onConfirm: (userId: string) => Promise<void>
  onCancel: (userId: string) => Promise<void>
  loadDraft: (userId: string) => Promise<any>
}

type EditDeleteOptions = {
  namespace: string
  userId: string
  message?: string
  editLabel?: string
  deleteLabel?: string
  summaryText?: string
  header?: string
  onEdit: (userId: string) => Promise<void>
  onDelete?: (userId: string) => Promise<void>
}

export async function sendConfirmationButtons({ namespace, userId, message = getInteractiveCopy('confirmAction'), confirmLabel = 'Confirmar', cancelLabel = 'Agora nao', onConfirm, onCancel, summaryText, loadDraft, maxRetries = 3 }: ConfirmationOptions & { maxRetries?: number }) {
  const confirmId = buildNamespacedId(namespace, 'CONFIRM')
  const cancelId = buildNamespacedId(namespace, 'CANCEL')

  if (summaryText) await sendWhatsAppMessage(userId, summaryText)

  await sendWhatsAppInteractiveButtons({
    to: userId,
    body: message,
    buttons: [
      { id: confirmId, title: confirmLabel },
      { id: cancelId, title: cancelLabel },
    ],
  })

  registerPendingListInteraction({
    userId,
    type: 'confirmationInteraction',
    namespace,
    ids: ['CONFIRM', 'CANCEL'],
  })

  const attemptKey = `${namespace}_attempts`
  let attempts = (global as any)[attemptKey] || 0

  registerInteractiveSelectionHandler(namespace, async ({ userId, value, accepted }) => {
    if (!accepted) {
      attempts++
      ;(global as any)[attemptKey] = attempts

      if (attempts >= maxRetries) {
        await sendWhatsAppMessage(userId, 'Nao consegui manter essa confirmacao aberta por aqui. Tenta de novo em instantes.')
        delete (global as any)[attemptKey]
        return
      }

      await sendWhatsAppMessage(userId, getInteractiveCopy('retryExpired', { attempts, maxRetries }))

      const draft = await loadDraft(userId)
      if (!draft) {
        await sendWhatsAppMessage(userId, 'Perdi essas informacoes por aqui. Melhor comecar de novo rapidinho.')
        delete (global as any)[attemptKey]
        return
      }

      const retryNamespace = `${namespace}_retry_${attempts}`
      await sendConfirmationButtons({
        namespace: retryNamespace,
        userId,
        message,
        confirmLabel,
        cancelLabel,
        onConfirm,
        onCancel,
        loadDraft,
        maxRetries,
      })
      return
    }

    delete (global as any)[attemptKey]

    if (value === 'CONFIRM') {
      await onConfirm(userId)
      return
    }

    if (value === 'CANCEL') {
      await onCancel(userId)
      return
    }
    systemLogger.warn(
      {
        namespace,
        value,
      },
      'Unexpected value received on confirmation buttons.',
    )
  })
}

export async function sendEditDeleteButtons({ namespace, userId, message = getInteractiveCopy('whatNext'), editLabel = 'Editar', deleteLabel = 'Excluir', onEdit, onDelete, summaryText, header = 'Tudo certo' }: EditDeleteOptions) {
  const editId = buildNamespacedId(namespace, 'EDIT')
  const deleteId = buildNamespacedId(namespace, 'DELETE')

  const body = summaryText || 'Pronto, ficou assim.'
  const footer = message

  const buttons = [{ id: editId, title: editLabel }]
  const pendingIds = ['EDIT']

  if (onDelete) {
    buttons.push({ id: deleteId, title: deleteLabel })
    pendingIds.push('DELETE')
  }

  await sendWhatsAppInteractiveButtons({
    to: userId,
    header: header,
    body: body,
    footer: footer,
    buttons,
  })

  registerPendingListInteraction({
    userId,
    type: 'editDeleteInteraction',
    namespace,
    ids: pendingIds,
  })

  registerInteractiveSelectionHandler(namespace, async ({ userId, value, accepted }) => {
    if (!accepted) {
      await sendWhatsAppMessage(userId, getInteractiveCopy('expiredOption'))
      return
    }

    if (value === 'EDIT') {
      await onEdit(userId)
      return
    }

    if (value === 'DELETE') {
      if (!onDelete) {
        await sendWhatsAppMessage(userId, getInteractiveCopy('notAvailable'))
        return
      }
      await onDelete(userId)
      return
    }

    systemLogger.warn(
      {
        namespace,
        value,
      },
      'Unexpected value received on edit/delete buttons.',
    )
  })
}

type EditDeleteOptionsAfterError = EditDeleteOptions & {
  errorMessage?: string
}

export async function sendEditDeleteButtonsAfterError({ namespace, userId, message = getInteractiveCopy('whatNext'), editLabel = 'Editar', deleteLabel = 'Excluir', onEdit, onDelete, summaryText, header = 'Vamos ajustar', errorMessage }: EditDeleteOptionsAfterError) {
  const editId = buildNamespacedId(namespace, 'EDIT')
  const deleteId = buildNamespacedId(namespace, 'DELETE')

  const body = summaryText || 'Te mostro como ficou ate aqui.'
  const footer = message

  const buttons = [{ id: editId, title: editLabel }]
  const pendingIds = ['EDIT']

  if (onDelete) {
    buttons.push({ id: deleteId, title: deleteLabel })
    pendingIds.push('DELETE')
  }

  await sendWhatsAppInteractiveButtons({
    to: userId,
    header: errorMessage || header,
    body: body,
    footer: footer,
    buttons,
  })

  registerPendingListInteraction({
    userId,
    type: 'editDeleteInteraction',
    namespace,
    ids: pendingIds,
  })

  registerInteractiveSelectionHandler(namespace, async ({ userId, value, accepted }) => {
    if (!accepted) {
      await sendWhatsAppMessage(userId, getInteractiveCopy('expiredOption'))
      return
    }

    if (value === 'EDIT') {
      await onEdit(userId)
      return
    }

    if (value === 'DELETE') {
      if (!onDelete) {
        await sendWhatsAppMessage(userId, getInteractiveCopy('notAvailable'))
        return
      }
      await onDelete(userId)
      return
    }

    systemLogger.warn(
      {
        namespace,
        value,
      },
      'Unexpected value received on edit/delete buttons after error.',
    )
  })
}

type EditCancelOptionsAfterCreationError = {
  namespace: string
  userId: string
  message?: string
  editLabel?: string
  cancelLabel?: string
  summaryText?: string
  header?: string
  errorMessage?: string
  onEdit: (userId: string) => Promise<void>
  onCancel: (userId: string) => Promise<void>
}

export async function sendEditCancelButtonsAfterCreationError({ namespace, userId, message = getInteractiveCopy('whatNext'), editLabel = 'Editar', cancelLabel = 'Parar por aqui', onEdit, onCancel, summaryText, header = 'Vamos ajustar', errorMessage }: EditCancelOptionsAfterCreationError) {
  const editId = buildNamespacedId(namespace, 'EDIT')
  const cancelId = buildNamespacedId(namespace, 'CANCEL')

  const body = summaryText || 'Nao consegui concluir isso agora.'
  const footer = message

  await sendWhatsAppInteractiveButtons({
    to: userId,
    header: errorMessage || header,
    body: body,
    footer: footer,
    buttons: [
      { id: editId, title: editLabel },
      { id: cancelId, title: cancelLabel },
    ],
  })

  registerPendingListInteraction({
    userId,
    type: 'editCancelInteraction',
    namespace,
    ids: ['EDIT', 'CANCEL'],
  })

  registerInteractiveSelectionHandler(namespace, async ({ userId, value, accepted }) => {
    if (!accepted) {
      await sendWhatsAppMessage(userId, getInteractiveCopy('expiredOption'))
      return
    }

    if (value === 'EDIT') {
      await onEdit(userId)
      return
    }

    if (value === 'CANCEL') {
      await onCancel(userId)
      return
    }

    systemLogger.warn(
      {
        namespace,
        value,
      },
      'Unexpected value received on edit/cancel buttons after creation error.',
    )
  })
}

type SingleActionButtonOptions = {
  namespace: string
  userId: string
  message: string
  buttonLabel: string
  onAction: (userId: string) => Promise<void>
  summaryText?: string
}

export async function sendSingleActionButton({ namespace, userId, message, buttonLabel, onAction, summaryText }: SingleActionButtonOptions) {
  const actionId = buildNamespacedId(namespace, 'ACTION')

  if (summaryText) await sendWhatsAppMessage(userId, summaryText)

  await sendWhatsAppInteractiveButtons({
    to: userId,
    body: message,
    buttons: [{ id: actionId, title: buttonLabel }],
  })

  registerPendingListInteraction({
    userId,
    type: 'singleActionInteraction',
    namespace,
    ids: ['ACTION'],
  })

  registerInteractiveSelectionHandler(namespace, async ({ userId, value, accepted }) => {
    if (!accepted) {
      await sendWhatsAppMessage(userId, getInteractiveCopy('expiredOption'))
      return
    }

    if (value === 'ACTION') {
      await onAction(userId)
      return
    }

    systemLogger.warn(
      {
        namespace,
        value,
      },
      'Unexpected value received on single action button.',
    )
  })
}
