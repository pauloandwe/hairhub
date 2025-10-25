/**
 * Parse time string (HH:mm) to hours and minutes
 */
export function parseTime(timeString: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeString.split(':').map(Number)
  return { hours, minutes }
}

/**
 * Format hours and minutes to time string (HH:mm)
 */
export function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Add minutes to a time string
 */
export function addMinutes(time: string, minutesToAdd: number): string {
  const { hours, minutes } = parseTime(time)
  let totalMinutes = hours * 60 + minutes + minutesToAdd
  const newHours = Math.floor(totalMinutes / 60) % 24
  const newMinutes = totalMinutes % 60
  return formatTime(newHours, newMinutes)
}

/**
 * Get day of week from date string (YYYY-MM-DD)
 * Returns 0 for Sunday, 1 for Monday, etc.
 */
export function getDayOfWeek(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

/**
 * Generate time slots between start and end time
 * @param start Start time (HH:mm)
 * @param end End time (HH:mm)
 * @param interval Interval in minutes
 * @param breakStart Optional break start time (HH:mm)
 * @param breakEnd Optional break end time (HH:mm)
 * @returns Array of time strings
 */
export function generateTimeSlots(
  start: string,
  end: string,
  interval: number = 30,
  breakStart?: string,
  breakEnd?: string
): string[] {
  const slots: string[] = []
  const { hours: startHour, minutes: startMinute } = parseTime(start)
  const { hours: endHour, minutes: endMinute } = parseTime(end)

  let currentHour = startHour
  let currentMinute = startMinute

  while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
    const timeString = formatTime(currentHour, currentMinute)

    // Check if time is during break
    const isDuringBreak = breakStart && breakEnd && timeString >= breakStart && timeString < breakEnd

    if (!isDuringBreak) {
      slots.push(timeString)
    }

    // Increment by interval
    currentMinute += interval
    if (currentMinute >= 60) {
      currentMinute -= 60
      currentHour += 1
    }
  }

  return slots
}

/**
 * Check if date is in the past
 */
export function isDateInPast(date: string): boolean {
  const dateObj = new Date(date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dateObj < today
}

/**
 * Check if datetime is in the past
 */
export function isDateTimeInPast(dateTime: string): boolean {
  const dateTimeObj = new Date(dateTime)
  const now = new Date()
  return dateTimeObj < now
}

/**
 * Format date to Brazilian format (DD/MM/YYYY)
 */
export function formatDateBR(date: string): string {
  const dateObj = new Date(date + 'T00:00:00')
  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = dateObj.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Format date to Brazilian format with day of week
 * Example: "Sábado, 02/11/2024"
 */
export function formatDateFullBR(date: string): string {
  const dateObj = new Date(date + 'T00:00:00')
  const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const dayOfWeek = daysOfWeek[dateObj.getDay()]
  return `${dayOfWeek}, ${formatDateBR(date)}`
}

/**
 * Get date string for today (YYYY-MM-DD)
 */
export function getTodayString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get date string for a specific number of days from now
 */
export function getDateString(daysFromNow: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
