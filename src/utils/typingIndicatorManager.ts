type CancelFn = () => void

type TypingIndicatorState = {
  timeout?: NodeJS.Timeout
  hasTriggered: boolean
  onCancelAfterTrigger?: () => void
}

const indicatorStates = new Map<string, TypingIndicatorState>()

type ScheduleOptions = {
  userId: string
  delayMs: number
  sendIndicator: () => Promise<void> | void
  onCancelAfterTrigger?: () => Promise<void> | void
}

export function scheduleTypingIndicator(options: ScheduleOptions): CancelFn {
  const { userId, delayMs, sendIndicator, onCancelAfterTrigger } = options

  cancelTypingIndicatorForUser(userId)

  const state: TypingIndicatorState = {
    hasTriggered: false,
    onCancelAfterTrigger: onCancelAfterTrigger
      ? () => {
          voidPromise(onCancelAfterTrigger)
        }
      : undefined,
  }

  const timeout = setTimeout(() => {
    state.timeout = undefined
    state.hasTriggered = true
    voidPromise(sendIndicator)
  }, delayMs)

  state.timeout = timeout
  indicatorStates.set(userId, state)

  return () => cancelTypingIndicatorForUser(userId)
}

export function cancelTypingIndicatorForUser(userId: string): void {
  const state = indicatorStates.get(userId)
  if (!state) return

  if (state.timeout) {
    clearTimeout(state.timeout)
  } else if (state.hasTriggered && state.onCancelAfterTrigger) {
    state.onCancelAfterTrigger()
  }

  indicatorStates.delete(userId)
}

function voidPromise(fn: () => Promise<void> | void): void {
  try {
    const result = fn()
    if (isPromiseLike(result)) {
      result.catch((error: unknown) => {
        console.error('[TypingIndicatorManager] Erro em callback assíncrono:', error)
      })
    }
  } catch (error) {
    console.error('[TypingIndicatorManager] Erro ao executar callback do indicador de digitação:', error)
  }
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof (value as any).then === 'function'
}
