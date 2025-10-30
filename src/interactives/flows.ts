import { markMessageAsRead, sendWhatsAppInteractiveList, sendWhatsAppMessage } from '../api/meta.api'
import { MORE_ACTION_TOKEN, buildNamespacedId, buildPaginatedListRows, registerPendingListInteraction } from '../utils/interactive'
import { registerInteractiveSelectionHandler } from './registry'
import { getUserContextSync } from '../env.config'
import { UiDefaults } from './types'

export interface SelectionFlowConfig<T extends { id: string; name?: string; description?: string }> {
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
  extraActions?: SelectionFlowExtraAction[]
  onError?: (ctx: { userId: string; error: unknown; stage: 'list' | 'selection' }) => Promise<boolean | void> | boolean | void
}

export interface SelectionFlowExtraAction {
  id: string
  title: string
  description?: string
  sectionTitle?: string
  onSelected: (ctx: { userId: string; messageId: string }) => Promise<void>
}

const MAX_WHATSAPP_LIST_ROWS = 10
const MAX_WHATSAPP_SECTION_TITLE_LENGTH = 24
const MAX_WHATSAPP_ROW_TITLE_LENGTH = 24
const MAX_WHATSAPP_ROW_DESCRIPTION_LENGTH = 72

function sanitizeSectionTitle(title: string): string {
  if (!title) return 'Ações'
  if (title.length <= MAX_WHATSAPP_SECTION_TITLE_LENGTH) return title
  const trimmed = title.slice(0, MAX_WHATSAPP_SECTION_TITLE_LENGTH - 1).trimEnd()
  return `${trimmed}…`
}

function sanitizeRowTitle(title: string): string {
  const normalized = title?.trim() ?? ''
  if (!normalized) return 'Opção'
  if (normalized.length <= MAX_WHATSAPP_ROW_TITLE_LENGTH) return normalized
  const trimmed = normalized.slice(0, MAX_WHATSAPP_ROW_TITLE_LENGTH - 1).trimEnd()
  return `${trimmed}…`
}

function sanitizeRowDescription(description?: string): string | undefined {
  if (!description) return undefined
  const normalized = description.trim()
  if (!normalized) return undefined
  if (normalized.length <= MAX_WHATSAPP_ROW_DESCRIPTION_LENGTH) return normalized
  const trimmed = normalized.slice(0, MAX_WHATSAPP_ROW_DESCRIPTION_LENGTH - 1).trimEnd()
  return `${trimmed}…`
}

export function createSelectionFlow<T extends { id: string; name?: string; description?: string }>(config: SelectionFlowConfig<T>) {
  const pageLimit = config.pageLimit ?? 10
  const overrideItemCache = new Map<string, T[]>()
  const availableExtraActionSlots = Math.max(0, MAX_WHATSAPP_LIST_ROWS - 1)
  const configuredExtraActions = (config.extraActions ?? []).filter((action): action is SelectionFlowExtraAction => Boolean(action?.id))
  const registeredExtraActions = configuredExtraActions.slice(0, availableExtraActionSlots)
  if (configuredExtraActions.length > availableExtraActionSlots) {
    console.warn(`[SelectionFlow] Limiting extra actions for ${config.namespace} to ${availableExtraActionSlots}. Received ${configuredExtraActions.length} actions.`)
  }
  const extraActionHandlers = new Map<string, SelectionFlowExtraAction>()
  const sanitizedExtraActions = registeredExtraActions.map((action) => {
    extraActionHandlers.set(action.id, action)
    return {
      id: action.id,
      sectionTitle: sanitizeSectionTitle(action.sectionTitle?.trim() || 'Ações'),
      title: sanitizeRowTitle(action.title),
      description: sanitizeRowDescription(action.description),
    }
  })

  async function handleFlowError(userId: string, error: unknown, stage: 'list' | 'selection'): Promise<boolean> {
    if (!config.onError) return false
    try {
      const handled = await config.onError({ userId, error, stage })
      return handled === true
    } catch (handlerError) {
      console.error(`[SelectionFlow] Erro ao executar handler de erro em ${config.namespace}:`, handlerError)
      return false
    }
  }

  async function sendList(userId: string, bodyMsg?: string, offset = 0, itemsOverride?: T[]) {
    try {
      if (Array.isArray(itemsOverride)) {
        if (itemsOverride.length > 0) {
          overrideItemCache.set(userId, itemsOverride)
        } else {
          overrideItemCache.delete(userId)
        }
      }

      const overrideItems = overrideItemCache.get(userId)
      let items: T[]
      if (overrideItems && overrideItems.length > 0) {
        items = overrideItems
      } else if (Array.isArray(itemsOverride) && itemsOverride.length > 0) {
        items = itemsOverride
      } else {
        items = await config.fetchItems(userId)
      }

      if (items.length === 0) {
        const emptyMessage = config.emptyListMessage || `Nenhum(a) ${config.ui.sectionTitle.toLowerCase()} encontrado(a)`
        await sendWhatsAppMessage(userId, emptyMessage)
        return
      }

      const extraActionCount = sanitizedExtraActions.length
      const availableRowSlots = MAX_WHATSAPP_LIST_ROWS - extraActionCount
      if (availableRowSlots <= 0) {
        console.error(`[SelectionFlow] Unable to render list for ${config.namespace}: no row slots available after reserving extra actions.`)
        await sendWhatsAppMessage(userId, config.invalidSelectionMsg || 'Não consegui carregar as opções no momento. Por favor, tente novamente.')
        return
      }

      const effectivePageLimit = Math.max(1, Math.min(pageLimit, availableRowSlots))

      const { rows, actionRows, nextOffset, visibleIds } = buildPaginatedListRows<T>(
        config.namespace,
        items,
        offset,
        effectivePageLimit,
        (item: T, idx: number) => (config.titleBuilder ? config.titleBuilder(item, idx, offset) : `${offset + idx + 1}. ${item.name ?? item.id}`),
        (item: T, idx: number) => config.descriptionBuilder?.(item, idx, offset),
      )

      const extraSections: { title: string; rows: { id: string; title: string; description?: string }[] }[] = []

      if (actionRows.length) {
        extraSections.push({
          title: 'Ações',
          rows: actionRows,
        })
      }

      if (sanitizedExtraActions.length > 0) {
        const groupedSections = new Map<string, { title: string; rows: { id: string; title: string; description?: string }[] }>()

        sanitizedExtraActions.forEach((action) => {
          const sectionKey = action.sectionTitle
          const existing = groupedSections.get(sectionKey)
          const row = {
            id: buildNamespacedId(config.namespace, action.id),
            title: action.title,
            description: action.description,
          }

          if (existing) {
            existing.rows.push(row)
          } else {
            groupedSections.set(sectionKey, {
              title: sectionKey,
              rows: [row],
            })
          }
        })

        groupedSections.forEach((section) => {
          if (!section.rows.length) return
          extraSections.push(section)
        })
      }

      await sendWhatsAppInteractiveList({
        to: userId,
        header: config.ui.header,
        body: bodyMsg || config.defaultBody || 'Selecione uma opção',
        footer: config.ui.footer ?? 'Inttegra Assistente',
        buttonLabel: config.ui.buttonLabel ?? 'Ver opções',
        sectionTitle: config.ui.sectionTitle,
        rows,
        extraSections: extraSections.length ? extraSections : undefined,
      })

      const historyMessage = `Enviei a lista de "${config.ui.sectionTitle}" para você escolher`

      console.log(`[SelectionFlow] ${historyMessage} (userId: ${userId})`)
      const extraActionIds = sanitizedExtraActions.map((action) => action.id)
      const ids = [...visibleIds, ...extraActionIds, ...(nextOffset !== undefined ? [`${MORE_ACTION_TOKEN}:${nextOffset}`] : [])]

      registerPendingListInteraction({
        userId,
        type: config.type,
        namespace: config.namespace,
        ids,
      })
    } catch (error) {
      console.error(`[SelectionFlow] Erro ao carregar lista em ${config.namespace}:`, error)
      const handled = await handleFlowError(userId, error, 'list')
      if (!handled) {
        await sendWhatsAppMessage(userId, 'Não consegui carregar as opções no momento. Por favor, tente novamente.')
      }
    }
  }

  registerInteractiveSelectionHandler(config.namespace, async ({ userId, messageId, value, accepted }) => {
    try {
      if (String(value).startsWith(`${MORE_ACTION_TOKEN}:`)) {
        const nextOffset = parseInt(String(value).split(':')[1] || '0', 10) || 0
        await sendList(userId, config.defaultBody || 'Selecione uma opção', nextOffset)
        return
      }

      if (extraActionHandlers.has(String(value))) {
        if (!accepted) {
          await sendWhatsAppMessage(userId, config.invalidSelectionMsg || 'Opa, essa opção expirou')
          await sendList(userId, config.defaultBody || 'Selecione uma opção')
          return
        }

        const action = extraActionHandlers.get(String(value))

        if (action) {
          overrideItemCache.delete(userId)
          await action.onSelected({ userId, messageId })
          return
        }
      }

      const overrideItems = overrideItemCache.get(userId) ?? []
      let selected = overrideItems.find((it) => String(it.id) === String(value))

      if (!selected) {
        let items: T[]
        try {
          items = await config.fetchItems(userId)
        } catch (error) {
          console.error(`[SelectionFlow] Erro ao recarregar lista em ${config.namespace}:`, error)
          const handled = await handleFlowError(userId, error, 'selection')
          if (!handled) {
            await sendWhatsAppMessage(userId, config.invalidSelectionMsg || 'Opa, essa opção expirou')
            await sendList(userId, config.defaultBody || 'Selecione uma opção')
          }
          return
        }
        selected = items.find((it) => String(it.id) === String(value))
      }

      if (!accepted || !selected) {
        await sendWhatsAppMessage(userId, config.invalidSelectionMsg || 'Opa, essa opção expirou')
        await sendList(userId, config.defaultBody || 'Selecione uma opção')
        return
      }

      const ctx = getUserContextSync(userId)
      const isEditMode = !!ctx?.activeRegistration?.editMode
      if (isEditMode && config.onEditModeSelected) {
        await config.onEditModeSelected({ userId, item: selected, messageId })
        overrideItemCache.delete(userId)
        return
      }

      await config.onSelected({ userId, item: selected, messageId })
      overrideItemCache.delete(userId)
    } catch (error) {
      console.error(`[SelectionFlow] Erro ao processar seleção em ${config.namespace}:`, error)
      await sendWhatsAppMessage(userId, 'Não consegui processar sua seleção no momento. Por favor, tente novamente.')
    }
  })

  return { sendList }
}

export interface TwoStepFlowConfig<G extends { id: string; name?: string; description?: string }, C extends { id: string; name?: string; description?: string }> {
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

export function createTwoStepSelectionFlow<G extends { id: string; name?: string; description?: string }, C extends { id: string; name?: string; description?: string }>(config: TwoStepFlowConfig<G, C>) {
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

      markMessageAsRead(messageId)
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
