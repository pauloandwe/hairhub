import { logger } from './pino'

type LoggerLike = Pick<typeof logger, 'info' | 'warn' | 'error' | 'debug' | 'child'>

type StepStatus = 'ok' | 'error' | 'skipped'

export class RequestLatencyTracker {
  private readonly startedAt = Date.now()
  private readonly traceLogger: LoggerLike

  constructor(
    loggerInstance: LoggerLike,
    private readonly metadata: Record<string, unknown>,
  ) {
    this.traceLogger = loggerInstance.child({
      ...metadata,
    })
  }

  async run<T>(step: string, task: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T> {
    const stepStartedAt = Date.now()

    try {
      const result = await task()
      this.logStep(step, 'ok', stepStartedAt, metadata)
      return result
    } catch (error) {
      this.logStep(step, 'error', stepStartedAt, {
        ...metadata,
        error,
      })
      throw error
    }
  }

  runDetached(step: string, task: () => Promise<unknown>, metadata?: Record<string, unknown>): void {
    const stepStartedAt = Date.now()

    Promise.resolve()
      .then(task)
      .then(() => {
        this.logStep(step, 'ok', stepStartedAt, metadata)
      })
      .catch((error) => {
        this.logStep(step, 'error', stepStartedAt, {
          ...metadata,
          error,
        })
      })
  }

  mark(step: string, status: StepStatus, metadata?: Record<string, unknown>): void {
    this.traceLogger.info(
      {
        step,
        status,
        durationMs: 0,
        ...metadata,
      },
      'request_step',
    )
  }

  finish(metadata?: Record<string, unknown>): void {
    this.traceLogger.info(
      {
        step: 'request_total',
        status: 'ok',
        durationMs: Date.now() - this.startedAt,
        ...metadata,
      },
      'request_step',
    )
  }

  private logStep(step: string, status: StepStatus, stepStartedAt: number, metadata?: Record<string, unknown>): void {
    const payload = {
      step,
      status,
      durationMs: Date.now() - stepStartedAt,
      ...metadata,
    }

    if (status === 'error') {
      this.traceLogger.warn(payload, 'request_step')
      return
    }

    this.traceLogger.info(payload, 'request_step')
  }
}

export function createRequestLatencyTracker(loggerInstance: LoggerLike, metadata: Record<string, unknown>): RequestLatencyTracker {
  return new RequestLatencyTracker(loggerInstance, metadata)
}
