import api from '../../config/api.config'
import { getBusinessIdForPhone, getUserContext, getUserContextSync } from '../../env.config'
import { CacheKeys, EnvKeys } from '../../helpers/Enums'
import { APIResponseCreate } from '../../types/api.types'
import { createDraftStore } from '../drafts/draft-store'
import { ChatDraftEnvelope, ChatMessage } from '../drafts/types'
import { IBaseEntity, SelectionItem, SummarySections } from './generic.types'
import { buildSummary, computeMissing, MissingRule } from '../drafts/draft-flow.utils'
import { ApiError } from '../../errors/api-error'
import { getAppErrorMessage } from '../../utils/error-messages'
import { AppErrorCodes } from '../../enums/constants'
import { systemLogger } from '../../utils/pino'
import { naturalLanguageGenerator } from '../natural-language-generator.service'

type EndpointTemplate = string | ((context: EndpointContext) => string)

interface EndpointContext {
  phone: string
  recordId?: string
  farmId?: string
  businessId?: string
}

interface GenericServiceEndpointConfig {
  autoComplete?: EndpointTemplate
  create?: EndpointTemplate
  update?: EndpointTemplate
  patch?: EndpointTemplate
  delete?: EndpointTemplate
}

interface GenericServiceOptions {
  endpoints?: GenericServiceEndpointConfig
}

export abstract class GenericService<TDraft, TCreationPayload, TRecord extends IBaseEntity, TUpsertArgs> {
  protected store: ReturnType<typeof createDraftStore<ChatDraftEnvelope<TDraft>>>
  protected memoryDb: TRecord[] = []
  protected readonly options: GenericServiceOptions
  protected readonly disableAutoComplete: boolean
  constructor(protected type: string, protected emptyDraft: () => TDraft, protected servicePrefix: string, protected autoCompleteEndpoint: string, protected validEditableFields: (keyof TUpsertArgs)[], options: GenericServiceOptions = {}, disableAutoComplete: boolean = false) {
    this.store = createDraftStore<ChatDraftEnvelope<TDraft>>({
      keyPrefix: CacheKeys.CHAT_DRAFT,
      empty: () => ({
        type: this.type,
        history: [],
        payload: this.emptyDraft(),
        sessionId: undefined,
      }),
      ttlEnvVar: EnvKeys.REDIS_DRAFT_TTL_SEC,
      defaultTtlSec: 86400,
    })
    this.options = options
    this.disableAutoComplete = disableAutoComplete
  }

  protected abstract transformToApiPayload: (draft: TDraft, context: { farmId: number }) => TCreationPayload

  protected abstract buildListParams: (listType: string, context: { phone: string }) => Record<string, any>

  protected abstract extractDataFromResult: (listType: string, result: any) => any[]

  protected abstract formatItemToSelection: (listType: string, item: any) => SelectionItem

  protected abstract getListErrorMessage: (listType: string) => string

  protected abstract validateDraftArgsTypes: (args: Partial<TUpsertArgs>, currentDraft: TDraft) => void

  protected abstract getRequiredFields: () => MissingRule<TDraft>[]

  protected abstract getSummarySections: () => SummarySections[]

  abstract getValidFieldsFormatted(): string

  create = async (phone: string, draft: TDraft, endpointOverride?: string): Promise<{ id: string }> => {
    const endpoint = endpointOverride ?? this.resolveEndpointPath('create', { phone })
    return this._createRecord(phone, draft, endpoint)
  }

  update = async (phone: string, recordId: string, draft: TDraft, updates?: Partial<TUpsertArgs>, endpointOverride?: string): Promise<{ id: string }> => {
    if (updates && Object.keys(updates).length > 0) {
      const partialPayload = this.buildPartialUpdatePayload(draft, updates)
      if (!partialPayload || Object.keys(partialPayload).length === 0) {
        throw new Error('Nenhum campo válido informado para atualização.')
      }
      systemLogger.info(
        {
          type: this.type,
          phone,
          recordId,
          updatedFields: Object.keys(updates),
          payloadSize: Object.keys(partialPayload).length,
        },
        'Partial update requested.',
      )
      const patchEndpoint = endpointOverride ?? this.resolveEndpointPath('patch', { phone, recordId })
      return this._patchRecord(phone, recordId, patchEndpoint, partialPayload)
    }

    const updateEndpoint = endpointOverride ?? this.resolveEndpointPath('update', { phone, recordId })
    return this._updateRecord(phone, recordId, draft, updateEndpoint)
  }

  delete = async (phone: string, recordId: string, endpointOverride?: string): Promise<{ id: string }> => {
    const endpoint = endpointOverride ?? this.resolveEndpointPath('delete', { phone, recordId })
    return this._deleteRecord(recordId, endpoint)
  }

  protected buildAutoCompletePayload(data: TDraft, context: EndpointContext): Record<string, unknown> {
    return {
      data: {
        ...data,
        farmId: context.farmId,
      },
    }
  }

  protected buildPartialUpdatePayload(_draft: TDraft, _updates: Partial<TUpsertArgs>): Partial<TCreationPayload> | null {
    return null
  }

  isFieldValid = (editingField: string): boolean => {
    return this.validEditableFields.includes(editingField as keyof TUpsertArgs)
  }

  autoComplete = async (phone: string, data: TDraft): Promise<APIResponseCreate<TDraft>> => {
    const url = this.resolveEndpointUrl('autoComplete', { phone })
    const farmId = getBusinessIdForPhone(phone) || undefined
    const payload = this.buildAutoCompletePayload(data, { phone, farmId })
    return api.post(url, payload)
  }

  private getEndpointTemplate(action: keyof GenericServiceEndpointConfig): EndpointTemplate | undefined {
    if (action === 'autoComplete') {
      return this.options.endpoints?.autoComplete ?? this.autoCompleteEndpoint
    }

    const endpoints = this.options.endpoints ?? {}
    if (action === 'patch') {
      return endpoints.patch ?? endpoints.update
    }
    if (action === 'delete') {
      return endpoints.delete ?? endpoints.update
    }
    return endpoints[action]
  }

  private resolveEndpointPath(action: keyof GenericServiceEndpointConfig, context: EndpointContext): string {
    const template = this.getEndpointTemplate(action)
    if (!template) {
      throw new Error(`[BaseService:${this.type}] Endpoint '${action}' is not configured.`)
    }
    const resolvedFarmId = getBusinessIdForPhone(context.phone)
    const farmId = context.farmId ?? (resolvedFarmId || undefined)
    const runtimeContext: EndpointContext = {
      ...context,
      farmId: farmId || undefined,
    }
    const path = typeof template === 'function' ? template(runtimeContext) : template
    if (!path) {
      throw new Error(`[BaseService:${this.type}] Endpoint '${action}' resolved to an empty path.`)
    }
    return this.normalizeEndpoint(path)
  }

  private resolveEndpointUrl(action: keyof GenericServiceEndpointConfig, context: EndpointContext): string {
    const path = this.resolveEndpointPath(action, context)
    return `${this.servicePrefix}${path}`
  }

  private normalizeEndpoint(endpoint: string): string {
    let normalized = (endpoint || '').trim()
    if (!normalized) {
      return normalized
    }
    if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`
    }
    normalized = normalized.replace(/\/{2,}/g, '/')
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1)
    }
    return normalized
  }

  private ensureEndpointIncludesRecord(endpoint: string, recordId?: string): string {
    const normalized = this.normalizeEndpoint(endpoint)
    if (!recordId) {
      return normalized
    }
    const sanitizedRecord = String(recordId).trim()
    if (!sanitizedRecord) {
      return normalized
    }
    if (normalized.endsWith(`/${sanitizedRecord}`)) {
      return normalized
    }
    return `${normalized}/${sanitizedRecord}`
  }

  protected _createRecord = async (phone: string, draft: TDraft, endpoint: string): Promise<{ id: string }> => {
    const farmId = getBusinessIdForPhone(phone)
    if (!farmId) {
      throw new Error(`Could not determine farmId for phone: ${phone}`)
    }

    const apiPayload = this.transformToApiPayload(draft, { farmId: Number(farmId) })

    const normalizedEndpoint = this.normalizeEndpoint(endpoint)
    const url = `${this.servicePrefix}${normalizedEndpoint}`

    try {
      systemLogger.info(
        {
          type: this.type,
          endpoint: this.servicePrefix + normalizedEndpoint,
          payload: apiPayload,
        },
        'POST to API made with success.',
      )
      const response = (await api.post(url, { data: apiPayload })) as APIResponseCreate<TCreationPayload>
      const newRecord: TRecord = {
        createdAt: new Date().toISOString(),
        ...response.data.data,
      } as TRecord
      this.memoryDb.push(newRecord)
      return { id: String(newRecord.id) }
    } catch (error) {
      console.error(`[BaseService:${this.type}] Error creating record at ${url}:`, error)
      throw error
    }
  }

  protected loadEnvelope = async (userId: string): Promise<ChatDraftEnvelope<TDraft>> => {
    const envelope = await this.store.load(userId)
    if (envelope.type !== this.type) {
      const context = getUserContextSync(userId)
      return {
        type: this.type,
        history: [],
        payload: this.emptyDraft(),
        sessionId: context?.activeRegistration?.sessionId,
      }
    }
    return envelope
  }

  loadDraft = async (userId: string): Promise<TDraft> => {
    const envelope = await this.loadEnvelope(userId)
    return envelope.payload
  }

  getDraftHistory = async (userId: string): Promise<ChatMessage[]> => {
    const envelope = await this.loadEnvelope(userId)
    const context = getUserContextSync(userId)
    const currentSessionId = context?.activeRegistration?.sessionId

    if (envelope.sessionId !== currentSessionId) {
      envelope.history = []
      envelope.sessionId = currentSessionId
      await this.store.save(userId, envelope)
    }

    return envelope.history
  }

  saveDraft = async (userId: string, newDraft: TDraft): Promise<void> => {
    const envelope = await this.loadEnvelope(userId)
    const context = getUserContextSync(userId)

    envelope.payload = newDraft
    if (!envelope.sessionId && context?.activeRegistration?.sessionId) {
      envelope.sessionId = context.activeRegistration.sessionId
    }

    await this.store.save(userId, envelope)
  }

  updateDraft = async (userId: string, updates: Partial<TUpsertArgs>): Promise<TDraft> => {
    const currentDraft = await this.loadDraft(userId)
    this.validateDraftArgsTypes(updates, currentDraft)

    let updatedDraft = currentDraft

    if (!this.disableAutoComplete) {
      const autoCompleteResponse = await this.autoComplete(userId, currentDraft)
      const autoCompletePayload = this.extractDataFromResult('autoComplete', autoCompleteResponse)
      updatedDraft = { ...currentDraft, ...autoCompletePayload }
    }

    const envelope = await this.loadEnvelope(userId)
    const context = getUserContextSync(userId)
    envelope.payload = updatedDraft
    envelope.type = this.type
    if (!envelope.sessionId && context?.activeRegistration?.sessionId) {
      envelope.sessionId = context.activeRegistration.sessionId
    }

    await this.store.save(userId, envelope)
    systemLogger.info(
      {
        type: this.type,
        userId,
        draft: updatedDraft,
      },
      'Draft updated for user.',
    )
    return updatedDraft
  }

  appendHistoryToDraft = async (userId: string, history: ChatMessage[]): Promise<void> => {
    const currentEnvelope = await this.loadEnvelope(userId)
    const context = getUserContextSync(userId)
    currentEnvelope.history.push(...history)
    if (!currentEnvelope.sessionId && context?.activeRegistration?.sessionId) {
      currentEnvelope.sessionId = context.activeRegistration.sessionId
    }
    await this.store.save(userId, currentEnvelope)
  }

  removeMessageFromDraftHistory = async (userId: string, contentToRemove: string): Promise<boolean> => {
    const currentEnvelope = await this.loadEnvelope(userId)
    const context = getUserContextSync(userId)
    const initialLength = currentEnvelope.history.length
    currentEnvelope.history = currentEnvelope.history.filter((message: ChatMessage) => message.content !== contentToRemove)
    const wasRemoved = currentEnvelope.history.length < initialLength

    if (wasRemoved) {
      if (!currentEnvelope.sessionId && context?.activeRegistration?.sessionId) {
        currentEnvelope.sessionId = context.activeRegistration.sessionId
      }
      await this.store.save(userId, currentEnvelope)
    }

    return wasRemoved
  }

  clearDraft = async (userId: string): Promise<void> => {
    await this.store.clear(userId)
  }

  processFieldEdit = async (userId: string, editingField: keyof TUpsertArgs, value: any): Promise<TDraft | null> => {
    if (!editingField || !value) {
      console.error('Missing editingField or value in context.')
      return null
    }

    try {
      const updates = { [editingField]: value } as Partial<TUpsertArgs>

      return await this.updateDraft(userId, updates)
    } catch (error) {
      console.error(`[BaseService:${this.type}] Error processing field edit for ${String(editingField)}:`, error)
      return null
    }
  }

  list = async (): Promise<TRecord[]> => {
    return [...this.memoryDb]
  }

  hasMissingFields = async (draft: TDraft): Promise<(keyof TDraft)[]> => {
    const requiredFields = this.getRequiredFields()
    return computeMissing(draft, requiredFields)
  }

  updateDraftField = async (phone: string, field: keyof TUpsertArgs, value: TUpsertArgs[keyof TUpsertArgs]): Promise<boolean> => {
    const updates = { [field]: value } as Partial<TUpsertArgs>
    const updated = await this.updateDraft(phone, updates)
    return !!updated
  }

  fetchSelectionList = async (phone: string, listType: string, endpoint: string): Promise<SelectionItem[]> => {
    const params = this.buildListParams(listType, { phone })
    const url = `${this.servicePrefix}${endpoint}`

    try {
      const response = await api.get(url, { params })

      const rawDataArray = this.extractDataFromResult(listType, response.data)
      if (!Array.isArray(rawDataArray)) {
        console.error(`[BaseService:${this.type}] Data extractor for list '${listType}' did not return an array. Response:`, response.data)
        throw new Error('Invalid data structure received from the server.')
      }
      return rawDataArray.map((item) => this.formatItemToSelection(listType, item))
    } catch (error) {
      console.error(`[BaseService:${this.type}] Error fetching list '${listType}' from ${url}:`, error)
      throw new Error(this.getListErrorMessage(listType))
    }
  }

  buildDraftSummary = async (draft: TDraft): Promise<string> => {
    const sections = this.getSummarySections()
    return buildSummary<TDraft>('Resumo do registro:', draft, sections)
  }

  buildDraftSummaryNatural = async (draft: TDraft, phone: string, maxLength: 'short' | 'medium' | 'long' = 'medium'): Promise<string> => {
    try {
      const fixedSummary = await this.buildDraftSummary(draft)
      return await naturalLanguageGenerator.generateSummaryText(phone, fixedSummary, maxLength)
    } catch (error) {
      systemLogger.warn(
        {
          type: this.type,
          phone,
          error,
        },
        'Falha ao gerar resumo em linguagem natural, usando resumo fixo como fallback.',
      )
      return this.buildDraftSummary(draft)
    }
  }

  buildCreationPayload = async (args: { draft: TDraft; phone: string }): Promise<TCreationPayload | null> => {
    const { draft, phone } = args
    const farmId = Number(getBusinessIdForPhone(phone))
    const itsMissingRequiredFields = await this.hasMissingFields(draft)
    if (itsMissingRequiredFields.length > 0) {
      return null
    }
    return this.transformToApiPayload(draft, { farmId })
  }

  handleServiceError = (err: unknown): string => {
    if (err instanceof ApiError) {
      return getAppErrorMessage(err.key)
    } else if (err instanceof Error) {
      console.error('An unexpected non-API error occurred:', err)
      return getAppErrorMessage(AppErrorCodes.UNKNOWN_ERROR)
    } else {
      console.error('An unknown error type was caught:', err)
      return getAppErrorMessage(AppErrorCodes.UNKNOWN_ERROR)
    }
  }

  protected _updateRecord = async (phone: string, recordId: string, draft: TDraft, endpoint: string): Promise<{ id: string }> => {
    const farmId = getBusinessIdForPhone(phone)
    if (!farmId) {
      throw new Error(`Could not determine farmId for phone: ${phone}`)
    }

    const apiPayload = this.transformToApiPayload(draft, { farmId: Number(farmId) })
    const normalizedEndpoint = this.ensureEndpointIncludesRecord(endpoint, recordId)
    const url = `${this.servicePrefix}${normalizedEndpoint}`

    try {
      systemLogger.info(
        {
          type: this.type,
          recordId,
          endpoint: url,
          payload: apiPayload,
        },
        'PUT to API made with success.',
      )
      const response = (await api.put(url, { data: apiPayload })) as APIResponseCreate<TCreationPayload>

      const index = this.memoryDb.findIndex((record) => String(record.id) === recordId)
      if (index !== -1) {
        const updatedData = (response?.data?.data ?? apiPayload) as Partial<TRecord>
        this.memoryDb[index] = {
          ...this.memoryDb[index],
          ...updatedData,
        } as TRecord
      }

      return { id: recordId }
    } catch (error) {
      console.error(`[BaseService:${this.type}] Error updating record at ${url}:`, error)
      throw error
    }
  }

  protected _patchRecord = async (phone: string, recordId: string, endpoint: string, payload: Partial<TCreationPayload>): Promise<{ id: string }> => {
    if (!payload || Object.keys(payload).length === 0) {
      throw new Error('No fields provided for partial update.')
    }

    const normalizedEndpoint = this.ensureEndpointIncludesRecord(endpoint, recordId)
    const url = `${this.servicePrefix}${normalizedEndpoint}`

    try {
      systemLogger.info(
        {
          type: this.type,
          phone,
          recordId,
          endpoint: url,
          payload,
        },
        'PATCH to API made with success.',
      )
      const response = (await api.patch(url, { data: payload })) as APIResponseCreate<TCreationPayload>

      const index = this.memoryDb.findIndex((record) => String(record.id) === recordId)
      if (index !== -1) {
        const updatedData = (response?.data?.data ?? payload) as Partial<TRecord>
        this.memoryDb[index] = {
          ...this.memoryDb[index],
          ...updatedData,
        } as TRecord
      }

      return { id: recordId }
    } catch (error) {
      console.error(`[BaseService:${this.type}] Error partially updating record at ${url}:`, error)
      throw error
    }
  }

  protected _deleteRecord = async (recordId: string, endpoint: string): Promise<{ id: string }> => {
    const normalizedEndpoint = this.ensureEndpointIncludesRecord(endpoint, recordId)
    const url = `${this.servicePrefix}${normalizedEndpoint}`

    try {
      systemLogger.info(
        {
          type: this.type,
          recordId,
          endpoint: url,
        },
        'DELETE to API made with success.',
      )
      await api.delete(url)

      const index = this.memoryDb.findIndex((record) => String(record.id) === recordId)
      if (index !== -1) {
        this.memoryDb.splice(index, 1)
      }

      return { id: recordId }
    } catch (error) {
      console.error(`[BaseService:${this.type}] Error deleting record at ${url}:`, error)
      throw error
    }
  }
}
