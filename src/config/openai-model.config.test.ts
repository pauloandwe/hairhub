import assert from 'node:assert/strict'
import test from 'node:test'

import { OPENAI_MODEL_DEFAULTS, getOpenAIModelConfig } from './openai-model.config'

test('getOpenAIModelConfig returns the expected defaults', () => {
  assert.deepEqual(getOpenAIModelConfig({}), OPENAI_MODEL_DEFAULTS)
})

test('getOpenAIModelConfig allows overriding every model role through env-like input', () => {
  const config = getOpenAIModelConfig({
    OPENAI_AGENT_ROUTER_MODEL: 'router-model',
    OPENAI_AGENT_FLOW_MODEL: 'flow-model',
    OPENAI_AGENT_RESPONSE_MODEL: 'response-model',
    OPENAI_NLG_MODEL: 'nlg-model',
    OPENAI_INVOICE_OCR_MODEL: 'ocr-model',
  } as NodeJS.ProcessEnv)

  assert.deepEqual(config, {
    OPENAI_AGENT_ROUTER_MODEL: 'router-model',
    OPENAI_AGENT_FLOW_MODEL: 'flow-model',
    OPENAI_AGENT_RESPONSE_MODEL: 'response-model',
    OPENAI_NLG_MODEL: 'nlg-model',
    OPENAI_INVOICE_OCR_MODEL: 'ocr-model',
  })
})
