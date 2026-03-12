export const APPOINTMENT_DATE_CLARIFICATION_TTL_MS = 15 * 60 * 1000

export function toFutureIsoTimestamp(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

export function isIsoTimestampExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return true
  const expiresAtMs = new Date(expiresAt).getTime()
  return !Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs
}
