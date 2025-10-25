export const dateFunctions: {
  [key: string]: (args: any) => Promise<any>
} = {
  getTodayDate: async () => {
    const now = new Date()
    return {
      date: now.toISOString().split('T')[0],
    }
  },
  getCurrentMonthPeriod: async () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    const startDate = new Date(year, month, 1)
    const endDate = new Date(year, month + 1, 0)

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      monthName: now.toLocaleString('pt-BR', { month: 'long' }),
      year: year,
    }
  },
  calculateDateFromToday: async (args: { days: number }) => {
    const today = new Date()
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + args.days)

    return {
      date: targetDate.toISOString().split('T')[0],
      originalDate: today.toISOString().split('T')[0],
      daysAdded: args.days,
    }
  },
  getCurrentCropYear: async (args?: { date?: string }) => {
    const referenceDate = args?.date ? new Date(args.date) : new Date()
    const currentMonth = referenceDate.getMonth() + 1
    const currentYear = referenceDate.getFullYear()

    let cropYear: string
    if (currentMonth >= 7) {
      cropYear = `${currentYear}/${currentYear + 1}`
    } else {
      cropYear = `${currentYear - 1}/${currentYear}`
    }

    return {
      cropYear,
      startDate: cropYear.split('/')[0] + '-07-01',
      endDate: cropYear.split('/')[1] + '-06-30',
      referenceDate: referenceDate.toISOString().split('T')[0],
    }
  },
  getPreviousCropYear: async (args?: { date?: string }) => {
    const referenceDate = args?.date ? new Date(args.date) : new Date()
    const currentMonth = referenceDate.getMonth() + 1
    const currentYear = referenceDate.getFullYear()

    let previousCropYear: string
    if (currentMonth >= 7) {
      previousCropYear = `${currentYear - 1}/${currentYear}`
    } else {
      previousCropYear = `${currentYear - 2}/${currentYear - 1}`
    }

    return {
      cropYear: previousCropYear,
      startDate: previousCropYear.split('/')[0] + '-07-01',
      endDate: previousCropYear.split('/')[1] + '-06-30',
      referenceDate: referenceDate.toISOString().split('T')[0],
    }
  },
}
