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

test('createSelectionFlow stops fallback messaging when fetchItems aborts after handling the user response', async () => {
  const metaApi = await import('../api/meta.api')
  const { createSelectionFlow, SelectionFlowAbortError } = await import('./flows')

  const originalSendWhatsAppMessage = metaApi.sendWhatsAppMessage
  const originalSendWhatsAppInteractiveList = metaApi.sendWhatsAppInteractiveList

  const sentMessages: string[] = []
  let interactiveListCalls = 0

  metaApi.sendWhatsAppMessage = (async (_to: string, text: string) => {
    sentMessages.push(text)
    return 'wamid.test'
  }) as typeof metaApi.sendWhatsAppMessage

  metaApi.sendWhatsAppInteractiveList = (async () => {
    interactiveListCalls += 1
    return undefined
  }) as typeof metaApi.sendWhatsAppInteractiveList

  const flow = createSelectionFlow({
    namespace: 'TEST_ABORT_FLOW',
    type: 'testAbortFlow',
    fetchItems: async (userId: string) => {
      await metaApi.sendWhatsAppMessage(userId, 'mensagem ja tratada')
      throw new SelectionFlowAbortError('already handled', {
        userId,
        reason: 'test_abort',
      })
    },
    ui: {
      header: 'Teste',
      sectionTitle: 'Itens',
      buttonLabel: 'Ver',
    },
    emptyListMessage: 'mensagem vazia',
    onSelected: async () => {},
  })

  try {
    await flow.sendList('5511999999999')
  } finally {
    metaApi.sendWhatsAppMessage = originalSendWhatsAppMessage
    metaApi.sendWhatsAppInteractiveList = originalSendWhatsAppInteractiveList
  }

  assert.equal(interactiveListCalls, 0)
  assert.deepEqual(sentMessages, ['mensagem ja tratada'])
})
