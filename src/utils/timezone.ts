export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

export interface ZonedDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input)
}

export function isValidTimeZone(timeZone?: string | null): boolean {
  if (!timeZone) {
    return false
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function resolveTimeZone(timeZone?: string | null): string {
  return isValidTimeZone(timeZone) ? String(timeZone) : DEFAULT_TIMEZONE
}

export function getZonedParts(date: Date | string, timeZone?: string | null): ZonedDateParts {
  const dateObject = toDate(date)
  if (Number.isNaN(dateObject.getTime())) {
    return {
      year: 0,
      month: 0,
      day: 0,
      hour: 0,
      minute: 0,
      second: 0,
    }
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(dateObject)
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number.parseInt(parts.find((part) => part.type === type)?.value || '0', 10)

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

export function zonedDateTimeToUtcDate(
  localDateTime: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second?: number
  },
  timeZone?: string | null,
): Date {
  const resolvedTimeZone = resolveTimeZone(timeZone)
  const second = localDateTime.second ?? 0

  let guess = new Date(
    Date.UTC(
      localDateTime.year,
      localDateTime.month - 1,
      localDateTime.day,
      localDateTime.hour,
      localDateTime.minute,
      second,
      0,
    ),
  )

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = getZonedParts(guess, resolvedTimeZone)
    const diff =
      Date.UTC(
        localDateTime.year,
        localDateTime.month - 1,
        localDateTime.day,
        localDateTime.hour,
        localDateTime.minute,
        second,
        0,
      ) -
      Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second,
        0,
      )

    if (diff === 0) {
      return guess
    }

    guess = new Date(guess.getTime() + diff)
  }

  return guess
}

export function combineDateAndTimeInTimeZone(
  date: string,
  time: string,
  timeZone?: string | null,
): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)

  const candidate = zonedDateTimeToUtcDate(
    {
      year,
      month,
      day,
      hour,
      minute,
      second: 0,
    },
    timeZone,
  )

  if (Number.isNaN(candidate.getTime())) {
    throw new Error('Data ou horário inválido para o fuso configurado.')
  }

  return candidate
}

export function formatDateInTimeZone(date: Date | string, timeZone?: string | null): string | null {
  const parts = getZonedParts(date, timeZone)
  if (!parts.year) {
    return null
  }

  return `${`${parts.day}`.padStart(2, '0')}/${`${parts.month}`.padStart(2, '0')}/${parts.year}`
}

export function formatDayMonthInTimeZone(date: Date | string, timeZone?: string | null): string | null {
  const parts = getZonedParts(date, timeZone)
  if (!parts.year) {
    return null
  }

  return `${`${parts.day}`.padStart(2, '0')}/${`${parts.month}`.padStart(2, '0')}`
}

export function formatTimeInTimeZone(date: Date | string, timeZone?: string | null): string | null {
  const parts = getZonedParts(date, timeZone)
  if (!parts.year) {
    return null
  }

  return `${`${parts.hour}`.padStart(2, '0')}:${`${parts.minute}`.padStart(2, '0')}`
}

export function formatIsoDateInTimeZone(date: Date | string, timeZone?: string | null): string | null {
  const parts = getZonedParts(date, timeZone)
  if (!parts.year) {
    return null
  }

  return `${parts.year}-${`${parts.month}`.padStart(2, '0')}-${`${parts.day}`.padStart(2, '0')}`
}
