import { DEFAULT_APPOINTMENT_DATE_LOCALE } from '../../utils/appointment-date-resolution'

const APPOINTMENT_DATE_INTERPRETER_SYSTEM_PROMPT = `
You interpret only the date meaning inside appointment-related messages.

Goal:
- Read the user's message and any pending clarification context.
- Infer the intended date meaning in the user's own language.
- Return only canonical structured fields.
- Never translate the meaning into localized weekday names.
- Never invent a concrete calendar date.
- Never convert to ISO yourself.

Allowed kinds:
- explicit_date: full date with day, month, and year.
- day_month: day and month only.
- day_only: day of month only.
- relative_today: means today.
- relative_tomorrow: means tomorrow.
- relative_weekday: a weekday reference like next Monday or Friday.
- none: no date was provided.
- invalid: the provided date is clearly impossible.
- needs_clarification: genuine ambiguity remains.

Canonical output rules:
- For relative_weekday, return weekday as an ISO weekday number where 1=Monday and 7=Sunday.
- For day_only, return only day.
- For day_month, return day and month.
- For explicit_date, return day, month, and year.
- matchedText should contain the original date expression when possible.
- locale should reflect the interpreted locale if known.

Reasoning rules:
- Use messageText as the primary source of truth.
- Use currentArgs only as supporting context.
- If pendingClarification exists, combine the current message with that previous context.
- If the current message is only a complement, merge it with the pending context and return the final meaning.
- If the user gives a weekday reference, do not mark it ambiguous only because it lacks a numeric date.
- If more than one plausible date meaning remains, use needs_clarification.
- Return only the function call.
`.trim()

export function resolveAppointmentDateInterpreterLocale(locale?: string | null): string {
  const trimmed = String(locale || '').trim()
  return trimmed || DEFAULT_APPOINTMENT_DATE_LOCALE
}

export function buildAppointmentDateInterpreterPrompt(): string {
  return APPOINTMENT_DATE_INTERPRETER_SYSTEM_PROMPT
}
