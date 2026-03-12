import assert from 'node:assert/strict'
import test from 'node:test'

function applyRequiredEnv(): void {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
  process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test-meta-verify-token'
  process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test-meta-access-token'
  process.env.API_URL = process.env.API_URL || 'http://localhost:3000'
  process.env.WHATSAPP_SEND_TIMEOUT_MS = process.env.WHATSAPP_SEND_TIMEOUT_MS || '5000'
  process.env.WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS = process.env.WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS || '1'
}

applyRequiredEnv()

test('shouldRetryWhatsAppSend allows one retry for safe ECONNRESET failures before bytes are written', async () => {
  const { shouldRetryWhatsAppSend } = await import('./meta.api')
  const decision = shouldRetryWhatsAppSend({
    code: 'ECONNRESET',
    request: {
      _currentRequest: {
        _headerSent: true,
        finished: false,
        socket: {
          bytesWritten: 0,
        },
      },
    },
  })

  assert.deepEqual(decision, {
    retry: true,
    reason: 'pre_send_safe:ECONNRESET',
  })
})

test('shouldRetryWhatsAppSend blocks retry when the request may have already progressed', async () => {
  const { shouldRetryWhatsAppSend } = await import('./meta.api')
  const decision = shouldRetryWhatsAppSend({
    code: 'ECONNRESET',
    request: {
      _currentRequest: {
        _headerSent: true,
        finished: true,
        socket: {
          bytesWritten: 64,
        },
      },
    },
  })

  assert.equal(decision.retry, false)
  assert.match(decision.reason, /request_progressed/)
})

test('postToWhatsAppWithRetry retries exactly once for safe transient failures', async () => {
  const { postToWhatsAppWithRetry } = await import('./meta.api')
  let attempts = 0

  const response = await postToWhatsAppWithRetry(
    '123',
    {
      to: '5544999999999',
      type: 'text',
      text: { body: 'teste' },
    },
    {
      maxRetries: 1,
      sendFn: async () => {
        attempts += 1
        if (attempts === 1) {
          throw {
            code: 'ECONNRESET',
            request: {
              _currentRequest: {
                _headerSent: true,
                finished: false,
                socket: {
                  bytesWritten: 0,
                },
              },
            },
          }
        }

        return {
          data: {
            messages: [{ id: 'wamid.retry-ok' }],
          },
        }
      },
    },
  )

  assert.equal(attempts, 2)
  assert.equal(response.data.messages[0].id, 'wamid.retry-ok')
})

test('postToWhatsAppWithRetry does not retry when Meta already returned an HTTP response', async () => {
  const { postToWhatsAppWithRetry } = await import('./meta.api')
  let attempts = 0

  await assert.rejects(async () => {
    await postToWhatsAppWithRetry(
      '123',
      {
        to: '5544999999999',
        type: 'text',
        text: { body: 'teste' },
      },
      {
        maxRetries: 1,
        sendFn: async () => {
          attempts += 1
          throw {
            response: {
              status: 500,
            },
          }
        },
      },
    )
  })

  assert.equal(attempts, 1)
})
