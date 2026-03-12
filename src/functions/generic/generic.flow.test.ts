import assert from 'node:assert/strict'
import test from 'node:test'

function applyRequiredEnv(): void {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
  process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test-meta-verify-token'
  process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test-meta-access-token'
  process.env.API_URL = process.env.API_URL || 'http://localhost:3000'
  process.env.REDIS_HOST = ''
  process.env.REDIS_PORT = ''
  process.env.REDIS_PASSWORD = ''
}

applyRequiredEnv()

type ServiceRef = { id: string | null; name: string | null }

type TestDraft = {
  service: ServiceRef | null
  appointmentTime: string | null
  status?: string
  recordId?: string | null
}

type TestUpsertArgs = {
  service?: ServiceRef | null
  appointmentTime?: string | null
  status?: string
}

class InMemoryFlowService {
  private draft: TestDraft = this.emptyDraft()
  clearDraftCalls = 0
  clearDraftHistoryCalls = 0

  private cloneDraft(value: TestDraft): TestDraft {
    return JSON.parse(JSON.stringify(value)) as TestDraft
  }

  private emptyDraft(): TestDraft {
    return {
      service: null,
      appointmentTime: null,
      status: 'collecting',
      recordId: null,
    }
  }

  async loadDraft(_phone: string): Promise<TestDraft> {
    return this.cloneDraft(this.draft)
  }

  async saveDraft(_phone: string, draft: TestDraft): Promise<void> {
    this.draft = this.cloneDraft(draft)
  }

  async updateDraft(_phone: string, updates: Partial<TestUpsertArgs>): Promise<TestDraft> {
    const nextDraft = this.cloneDraft(this.draft)

    if (Object.prototype.hasOwnProperty.call(updates, 'service')) {
      nextDraft.service = updates.service === undefined ? nextDraft.service : updates.service ?? null
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'appointmentTime')) {
      nextDraft.appointmentTime = updates.appointmentTime === undefined ? nextDraft.appointmentTime : updates.appointmentTime ?? null
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      nextDraft.status = updates.status
    }

    this.draft = nextDraft
    return this.cloneDraft(nextDraft)
  }

  async clearDraft(_phone: string): Promise<void> {
    this.clearDraftCalls += 1
    this.draft = this.emptyDraft()
  }

  async clearDraftHistory(_phone: string): Promise<void> {
    this.clearDraftHistoryCalls += 1
  }

  async hasMissingFields(draft: TestDraft): Promise<string[]> {
    const missing: string[] = []
    if (!draft.service?.id) missing.push('service')
    if (!draft.appointmentTime) missing.push('appointmentTime')
    return missing
  }

  async create(_phone: string, _draft: TestDraft): Promise<{ id: string }> {
    return { id: '1' }
  }

  async update(_phone: string, _recordId: string, _draft: TestDraft, _updates?: Partial<TestUpsertArgs>): Promise<{ id: string }> {
    return { id: '1' }
  }

  async delete(_phone: string, _recordId: string): Promise<{ id: string }> {
    return { id: '1' }
  }

  isFieldValid(field: string): boolean {
    return field === 'service' || field === 'appointmentTime'
  }

  getValidFieldsFormatted(): string {
    return 'serviço, horário'
  }

  handleServiceError(_error: unknown): string {
    return 'erro'
  }

  buildDraftSummary(_draft: TestDraft): string {
    return 'resumo'
  }

  async buildDraftSummaryNatural(_draft: TestDraft, _phone: string): Promise<string> {
    return 'resumo natural'
  }

  previewPartialUpdatePayload(_draft: TestDraft, _updates: Partial<TestUpsertArgs>): Record<string, unknown> {
    return {}
  }

  async setDraftForTest(draft: TestDraft): Promise<void> {
    this.draft = this.cloneDraft(draft)
  }
}

async function createFlowHarness() {
  const { GenericCrudFlow } = await import('./generic.flow')
  const { FlowStep, FlowType } = await import('../../enums/generic.enum')
  const { getUserContextSync, setUserContext } = await import('../../env.config')

  class TestAppointmentFlow extends (GenericCrudFlow as any) {
    constructor(private readonly memoryService: InMemoryFlowService) {
      super({
        service: memoryService,
        flowType: FlowType.Appointment,
        fieldEditors: {
          service: async () => ({ message: 'editar serviço', interactive: true }),
          appointmentTime: async () => ({ message: 'editar horário', interactive: true }),
        },
        missingFieldHandlers: {
          service: async (_phone: string, draft: TestDraft) => ({ message: 'ask-service', interactive: true, draft }),
          appointmentTime: async (_phone: string, draft: TestDraft) => ({ message: 'ask-time', interactive: true, draft }),
        },
        messages: {
          confirmation: 'confirmar',
          creationSuccess: 'sucesso',
          creationResponse: 'resposta sucesso',
          cancelSent: 'cancelado',
          cancelResponse: 'resposta cancelado',
          missingDataDuringConfirm: 'faltando',
          invalidField: 'invalido',
          editModeIntro: 'editar',
          editModeExamples: [],
          editRecordNotFound: 'nao encontrado',
          editFieldUpdateError: 'erro campo',
          editPromptFallback: 'pergunta',
          editDirectChangeSuccess: 'ok',
          editUpdateSuccess: 'atualizado',
          editUpdateError: 'erro atualizacao',
          deleteRecordNotFound: 'nao encontrou',
          deleteSuccess: 'deletado',
          deleteError: 'erro delete',
          useNaturalLanguage: false,
        },
      })
    }

    protected async sendConfirmation(_phone: string, _draft: TestDraft, _summary: string): Promise<void> {}

    protected async sendEditDeleteOptions(_phone: string, _draft: TestDraft, _summary: string, _recordId: string): Promise<void> {}

    protected async sendEditDeleteOptionsAfterError(_phone: string, _draft: TestDraft, _summary: string, _recordId: string, _errorMessage: string): Promise<void> {}

    protected async sendEditCancelOptionsAfterCreationError(_phone: string, _draft: TestDraft, _summary: string, _errorMessage: string, _recordId: string | null): Promise<void> {}

    protected async buildFreshDraftForRestartedCompletedSession(_phone: string, updates?: Partial<TestUpsertArgs>): Promise<TestDraft | null> {
      return {
        service: updates?.service ?? null,
        appointmentTime: updates?.appointmentTime ?? null,
        status: 'collecting',
        recordId: null,
      }
    }

    async resetForTest(phone: string, reason = 'test-reset'): Promise<void> {
      await this.resetFlowSession(phone, reason)
    }
  }

  return {
    FlowStep,
    FlowType,
    getUserContextSync,
    setUserContext,
    TestAppointmentFlow,
  }
}

test('GenericCrudFlow starts a fresh session when persisted draft is completed even without activeRegistration.status', async () => {
  const { FlowStep, getUserContextSync, setUserContext, TestAppointmentFlow } = await createFlowHarness()
  const phone = '5511999999001'
  const memoryService = new InMemoryFlowService()
  const flow = new TestAppointmentFlow(memoryService)

  await setUserContext(phone, {
    activeRegistration: {
      type: undefined,
      step: FlowStep.Initial,
    },
  } as any)

  await memoryService.setDraftForTest({
    service: { id: 'svc-old', name: 'Corte antigo' },
    appointmentTime: '16:00',
    status: 'completed',
    recordId: 'record-123',
  })

  const response = await flow.startRegistration({
    phone,
    appointmentTime: '17:00',
  })

  const updatedDraft = await memoryService.loadDraft(phone)
  const context = getUserContextSync(phone)

  assert.equal(response.message, 'ask-service')
  assert.equal(response.interactive, true)
  assert.equal(memoryService.clearDraftCalls, 1)
  assert.equal(updatedDraft.service, null)
  assert.equal(updatedDraft.appointmentTime, '17:00')
  assert.equal(updatedDraft.status, 'collecting')
  assert.ok(context?.activeRegistration?.sessionId)
  assert.equal(context?.activeRegistration?.status, 'collecting')
})

test('GenericCrudFlow resetFlowSession clears draft and resets active registration context', async () => {
  const { FlowStep, FlowType, getUserContextSync, setUserContext, TestAppointmentFlow } = await createFlowHarness()
  const phone = '5511999999002'
  const memoryService = new InMemoryFlowService()
  const flow = new TestAppointmentFlow(memoryService)

  await setUserContext(phone, {
    activeRegistration: {
      type: FlowType.Appointment,
      step: FlowStep.Creating,
      awaitingInputForField: 'service',
      status: 'collecting',
    },
    serviceId: 'svc-old',
    serviceName: 'Corte antigo',
    professionalId: 'pro-old',
    professionalName: 'João',
    timeSlot: '17:00',
    availableProfessionalIdsForSlot: ['pro-old'],
    autoAssignedProfessional: true,
  } as any)

  await memoryService.setDraftForTest({
    service: { id: 'svc-old', name: 'Corte antigo' },
    appointmentTime: '17:00',
    status: 'collecting',
    recordId: null,
  })

  await flow.resetForTest(phone)

  const draftAfterReset = await memoryService.loadDraft(phone)
  const context = getUserContextSync(phone)

  assert.equal(memoryService.clearDraftCalls, 1)
  assert.equal(memoryService.clearDraftHistoryCalls, 1)
  assert.equal(draftAfterReset.service, null)
  assert.equal(draftAfterReset.appointmentTime, null)
  assert.equal(context?.activeRegistration?.type, undefined)
  assert.equal(context?.activeRegistration?.step, FlowStep.Initial)
  assert.equal(context?.serviceId, null)
  assert.equal(context?.serviceName, null)
  assert.equal(context?.professionalId, null)
  assert.equal(context?.professionalName, null)
  assert.equal(context?.timeSlot, null)
  assert.deepEqual(context?.availableProfessionalIdsForSlot, null)
  assert.equal(context?.autoAssignedProfessional, false)
})
