import { sendWhatsAppInteractiveList, sendWhatsAppMessage } from '../api/meta.api'
import { appendUserTextAuto } from '../services/history-router.service'
import { MORE_ACTION_TOKEN, buildPaginatedListRows, registerPendingListInteraction } from '../utils/interactive'
import { registerInteractiveSelectionHandler } from './registry'
import { getUserContextSync } from '../env.config'
import { UiDefaults } from './types'

export interface SelectionFlowConfig<T extends { id: string; name?: string }> {
  namespace: string
  type: string
  fetchItems: (userId: string) => Promise<T[]>
  ui: UiDefaults
  defaultBody?: string
  invalidSelectionMsg?: string
  emptyListMessage?: string
  pageLimit?: number
  titleBuilder?: (item: T, index: number, baseIndex: number) => string
  descriptionBuilder?: (item: T, index: number, baseIndex: number) => string | undefined
  historyTextBuilder?: (item: T) => string
  onSelected: (ctx: { userId: string; item: T; messageId: string }) => Promise<void>
  onEditModeSelected?: (ctx: { userId: string; item: T; messageId: string }) => Promise<void>
}

export function createSelectionFlow<T extends { id: string; name?: string }>(config: SelectionFlowConfig<T>) {
  const pageLimit = config.pageLimit ?? 10

  async function sendList(userId: string, bodyMsg?: string, offset = 0, itemsOverride?: T[]) {
    try {
      const items: T[] = itemsOverride ?? (await config.fetchItems(userId))

      if (items.length === 0) {
        const emptyMessage = config.emptyListMessage || `Nenhum(a) ${config.ui.sectionTitle.toLowerCase()} encontrado(a)`
        await sendWhatsAppMessage(userId, emptyMessage)
        return
      }

      const { rows, actionRows, nextOffset, visibleIds } = buildPaginatedListRows<T>(
        config.namespace,
        items,
        offset,
        pageLimit,
        (item: T, idx: number) => (config.titleBuilder ? config.titleBuilder(item, idx, offset) : `${offset + idx + 1}. ${item.name ?? item.id}`),
        (item: T, idx: number) => config.descriptionBuilder?.(item, idx, offset),
      )

      await sendWhatsAppInteractiveList({
        to: userId,
        header: config.ui.header,
        body: bodyMsg || config.defaultBody || 'Selecione uma opção',
        footer: config.ui.footer ?? 'Inttegra Assistente',
        buttonLabel: config.ui.buttonLabel ?? 'Ver opções',
        sectionTitle: config.ui.sectionTitle,
        rows,
        extraSections: actionRows.length
          ? [
              {
                title: 'Ações',
                rows: actionRows,
              },
            ]
          : undefined,
      })

      const historyMessage = `Enviei a lista de "${config.ui.sectionTitle}" para você escolher`

      console.log(`[SelectionFlow] ${historyMessage} (userId: ${userId})`)
      const ids = [...visibleIds, ...(nextOffset !== undefined ? [`${MORE_ACTION_TOKEN}:${nextOffset}`] : [])]

      registerPendingListInteraction({
        userId,
        type: config.type,
        namespace: config.namespace,
        ids,
      })
    } catch (error) {
      console.error(`[SelectionFlow] Erro ao carregar lista em ${config.namespace}:`, error)
      await sendWhatsAppMessage(userId, 'Não consegui carregar as opções no momento. Por favor, tente novamente.')
    }
  }

  registerInteractiveSelectionHandler(config.namespace, async ({ userId, messageId, value, accepted }) => {
    try {
      if (String(value).startsWith(`${MORE_ACTION_TOKEN}:`)) {
        const nextOffset = parseInt(String(value).split(':')[1] || '0', 10) || 0
        await sendList(userId, config.defaultBody || 'Selecione uma opção', nextOffset)
        return
      }

      const items = await config.fetchItems(userId)
      const selected = items.find((it) => String(it.id) === String(value))

      if (!accepted || !selected) {
        await sendWhatsAppMessage(userId, config.invalidSelectionMsg || 'Opa, essa opção expirou')
        await sendList(userId, config.defaultBody || 'Selecione uma opção')
        return
      }

      const historyText = config.historyTextBuilder?.(selected) || `${config.ui.sectionTitle} selecionado(a): ${selected.name ?? selected.id}`
      await appendUserTextAuto(userId, historyText)

      const ctx = getUserContextSync(userId)
      const isEditMode = !!ctx?.activeRegistration?.editMode
      if (isEditMode && config.onEditModeSelected) {
        await config.onEditModeSelected({ userId, item: selected, messageId })
        return
      }

      await config.onSelected({ userId, item: selected, messageId })
    } catch (error) {
      console.error(`[SelectionFlow] Erro ao processar seleção em ${config.namespace}:`, error)
      await sendWhatsAppMessage(userId, 'Não consegui processar sua seleção no momento. Por favor, tente novamente.')
    }
  })

  return { sendList }
}

export interface TwoStepFlowConfig<G extends { id: string; name?: string }, C extends { id: string; name?: string }> {
  step1: {
    namespace: string
    type: string
    fetchItems: (userId: string) => Promise<G[]>
    ui: UiDefaults
    defaultBody?: string
    invalidSelectionMsg?: string
    emptyListMessage?: string
    titleBuilder?: (item: G, index: number, baseIndex: number) => string
    descriptionBuilder?: (item: G, index: number, baseIndex: number) => string | undefined
    historyTextBuilder?: (item: G) => string
    onSelected?: (ctx: { userId: string; item: G; messageId: string }) => Promise<void>
  }
  step2: {
    namespace: string
    type: string
    getParentId: (userId: string) => string | undefined
    fetchItemsByParent: (userId: string, parentId: string) => Promise<C[]>
    ui: UiDefaults
    defaultBody?: string
    invalidSelectionMsg?: string
    emptyListMessage?: string
    titleBuilder?: (item: C, index: number, baseIndex: number) => string
    descriptionBuilder?: (item: C, index: number, baseIndex: number) => string | undefined
    historyTextBuilder?: (item: C) => string
    onSelected?: (ctx: { userId: string; item: C; parentId: string; messageId: string }) => Promise<void>
    onEditModeSelected?: (ctx: { userId: string; item: C; parentId: string; messageId: string }) => Promise<void>
    buildBodyAfterStep1?: (selectedStep1: G) => string
  }
  pageLimit?: number
}

export function createTwoStepSelectionFlow<G extends { id: string; name?: string }, C extends { id: string; name?: string }>(config: TwoStepFlowConfig<G, C>) {
  const pageLimit = config.pageLimit ?? 10

  async function sendStep1List(userId: string, bodyMsg?: string, offset = 0) {
    try {
      const items: G[] = await config.step1.fetchItems(userId)

      if (items.length === 0) {
        const emptyMessage = config.step1.emptyListMessage || `Nenhum(a) ${config.step1.ui.sectionTitle.toLowerCase()} encontrado(a)`
        await sendWhatsAppMessage(userId, emptyMessage)
        return
      }

      const { rows, actionRows, nextOffset, visibleIds } = buildPaginatedListRows<G>(
        config.step1.namespace,
        items,
        offset,
        pageLimit,
        (item: G, idx: number) => (config.step1.titleBuilder ? config.step1.titleBuilder(item, idx, offset) : `${offset + idx + 1}. ${item.name ?? item.id}`),
        (item: G, idx: number) => config.step1.descriptionBuilder?.(item, idx, offset),
      )

      await sendWhatsAppInteractiveList({
        to: userId,
        header: config.step1.ui.header,
        body: bodyMsg || config.step1.defaultBody || 'Selecione uma opção',
        footer: config.step1.ui.footer ?? 'Inttegra Assistente',
        buttonLabel: config.step1.ui.buttonLabel ?? 'Ver opções',
        sectionTitle: config.step1.ui.sectionTitle,
        rows,
        extraSections: actionRows.length
          ? [
              {
                title: 'Ações',
                rows: actionRows,
              },
            ]
          : undefined,
      })

      const ids = [...visibleIds, ...(nextOffset !== undefined ? [`${MORE_ACTION_TOKEN}:${nextOffset}`] : [])]
      registerPendingListInteraction({
        userId,
        type: config.step1.type,
        namespace: config.step1.namespace,
        ids,
      })
    } catch (error) {
      console.error(`[TwoStepSelectionFlow] Erro ao carregar lista da etapa 1 em ${config.step1.namespace}:`, error)
      await sendWhatsAppMessage(userId, 'Não consegui carregar as opções no momento. Por favor, tente novamente.')
    }
  }

  async function sendStep2List(userId: string, parentId: string, bodyMsg?: string, offset = 0) {
    try {
      const items: C[] = await config.step2.fetchItemsByParent(userId, parentId)

      if (items.length === 0) {
        const emptyMessage = config.step2.emptyListMessage || `Nenhum(a) ${config.step2.ui.sectionTitle.toLowerCase()} encontrado(a)`
        await sendWhatsAppMessage(userId, emptyMessage)
        return
      }

      const { rows, actionRows, nextOffset, visibleIds } = buildPaginatedListRows<C>(
        config.step2.namespace,
        items,
        offset,
        pageLimit,
        (item: C, idx: number) => (config.step2.titleBuilder ? config.step2.titleBuilder(item, idx, offset) : `${offset + idx + 1}. ${item.name ?? item.id}`),
        (item: C, idx: number) => config.step2.descriptionBuilder?.(item, idx, offset),
      )

      await sendWhatsAppInteractiveList({
        to: userId,
        header: config.step2.ui.header,
        body: bodyMsg || config.step2.defaultBody || 'Selecione uma opção',
        footer: config.step2.ui.footer ?? 'Inttegra Assistente',
        buttonLabel: config.step2.ui.buttonLabel ?? 'Ver opções',
        sectionTitle: config.step2.ui.sectionTitle,
        rows,
        extraSections: actionRows.length
          ? [
              {
                title: 'Ações',
                rows: actionRows,
              },
            ]
          : undefined,
      })

      const ids = [...visibleIds, ...(nextOffset !== undefined ? [`${MORE_ACTION_TOKEN}:${nextOffset}`] : [])]
      registerPendingListInteraction({
        userId,
        type: config.step2.type,
        namespace: config.step2.namespace,
        ids,
      })
    } catch (error) {
      console.error(`[TwoStepSelectionFlow] Erro ao carregar lista da etapa 2 em ${config.step2.namespace}:`, error)
      await sendWhatsAppMessage(userId, 'Não consegui carregar as opções no momento. Por favor, tente novamente.')
    }
  }

  registerInteractiveSelectionHandler(config.step1.namespace, async ({ userId, messageId, value, accepted }) => {
    try {
      if (String(value).startsWith(`${MORE_ACTION_TOKEN}:`)) {
        const nextOffset = parseInt(String(value).split(':')[1] || '0', 10) || 0
        await sendStep1List(userId, config.step1.defaultBody || 'Selecione uma opção', nextOffset)
        return
      }

      const items = await config.step1.fetchItems(userId)
      const selected = items.find((it) => String(it.id) === String(value))

      if (!accepted || !selected) {
        await sendWhatsAppMessage(userId, config.step1.invalidSelectionMsg || 'Opa, essa opção expirou')
        await sendStep1List(userId, config.step1.defaultBody)
        return
      }

      // await markMessageAsRead(messageId)
      const historyText1 = config.step1.historyTextBuilder?.(selected) || `${config.step1.ui.sectionTitle} selecionado(a): ${selected.name ?? selected.id}`
      await appendUserTextAuto(userId, historyText1)
      if (config.step1.onSelected) {
        await config.step1.onSelected({ userId, item: selected, messageId })
      }

      const bodyForStep2 = config.step2.buildBodyAfterStep1?.(selected) || config.step2.defaultBody || 'Selecione uma opção'
      await sendStep2List(userId, selected.id, bodyForStep2)
    } catch (error) {
      console.error(`[TwoStepSelectionFlow] Erro ao processar seleção da etapa 1 em ${config.step1.namespace}:`, error)
      await sendWhatsAppMessage(userId, 'Não consegui processar sua seleção no momento. Por favor, tente novamente.')
    }
  })

  registerInteractiveSelectionHandler(config.step2.namespace, async ({ userId, messageId, value, accepted }) => {
    try {
      if (String(value).startsWith(`${MORE_ACTION_TOKEN}:`)) {
        const nextOffset = parseInt(String(value).split(':')[1] || '0', 10) || 0
        const parentId = config.step2.getParentId(userId)
        if (!parentId) {
          await sendWhatsAppMessage(userId, 'Não encontrei o contexto da etapa anterior. Recomeçando')
          await sendStep1List(userId, config.step1.defaultBody)
          return
        }
        await sendStep2List(userId, parentId, config.step2.defaultBody || 'Selecione uma opção', nextOffset)
        return
      }

      const parentId = config.step2.getParentId(userId)
      if (!parentId) {
        await sendWhatsAppMessage(userId, 'Contexto ausente. Reenviando a primeira seleção')
        await sendStep1List(userId, config.step1.defaultBody)
        return
      }

      const items = await config.step2.fetchItemsByParent(userId, parentId)
      const selected = items.find((it) => String(it.id) === String(value))

      if (!accepted || !selected) {
        await sendWhatsAppMessage(userId, config.step2.invalidSelectionMsg || 'Opa, essa opção expirou')
        await sendStep2List(userId, parentId, config.step2.defaultBody || 'Selecione uma opção')
        return
      }

      const historyText2 = config.step2.historyTextBuilder?.(selected) || `${config.step2.ui.sectionTitle} selecionado(a): ${selected.name ?? selected.id}`
      await appendUserTextAuto(userId, historyText2)

      const ctx = getUserContextSync(userId)
      const isEditMode = !!ctx?.activeRegistration?.editMode
      if (isEditMode && config.step2.onEditModeSelected) {
        await config.step2.onEditModeSelected({
          userId,
          item: selected,
          parentId,
          messageId,
        })
        return
      }

      if (config.step2.onSelected) {
        await config.step2.onSelected({
          userId,
          item: selected,
          parentId,
          messageId,
        })
      }
    } catch (error) {
      console.error(`[TwoStepSelectionFlow] Erro ao processar seleção da etapa 2 em ${config.step2.namespace}:`, error)
      await sendWhatsAppMessage(userId, 'Não consegui processar sua seleção no momento. Por favor, tente novamente.')
    }
  })

  return { sendStep1List, sendStep2List }
}
