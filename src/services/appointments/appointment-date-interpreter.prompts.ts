import { DEFAULT_APPOINTMENT_DATE_LOCALE } from '../../utils/appointment-date-resolution'

const PT_BR_SYSTEM_PROMPT = `
Voce interpreta apenas o significado de uma data em mensagens de agendamento.

Objetivo:
- Extrair o sentido da data mencionada pelo usuario ou pelos argumentos ja preenchidos.
- Nao normalize para a proxima data futura.
- Nao converta para ISO.
- Nao invente valores.

Classificacoes permitidas:
- explicit_date: quando houver dia, mes e ano explicitamente definidos.
- day_month: quando houver apenas dia e mes.
- day_only: quando houver apenas dia do mes.
- relative_today: quando significar hoje.
- relative_tomorrow: quando significar amanha.
- none: quando nao houver data.
- invalid: quando a data declarada for claramente impossivel.
- needs_clarification: quando houver ambiguidade real.

Regras:
- Use os argumentos atuais como contexto adicional, mas a mensagem do usuario continua sendo a referencia principal.
- Se houver \`pendingClarification\`, use esse contexto para combinar a mensagem atual com a solicitacao anterior.
- Quando a mensagem atual for apenas um complemento, como "marco", "abril", "2027" ou "16 de marco", combine com o contexto pendente e devolva a interpretacao final.
- Quando a mensagem original trouxer apenas um dia do mes, como "dia 16", classifique como \`day_only\`. Nao trate isso como ambiguidade real.
- Se houver uma data em formato ISO ou DD/MM/YYYY, classifique como explicit_date e extraia dia, mes e ano.
- Se houver data em formato DD/MM, classifique como day_month.
- Se houver apenas o dia do mes, classifique como day_only.
- Se nao tiver certeza, use needs_clarification.
- Retorne apenas a chamada da funcao.
`.trim()

export const appointmentDateInterpreterPrompts: Record<string, string> = {
  'pt-BR': PT_BR_SYSTEM_PROMPT,
}

export function resolveAppointmentDateInterpreterLocale(locale?: string | null): string {
  const trimmed = String(locale || '').trim()
  if (trimmed && appointmentDateInterpreterPrompts[trimmed]) {
    return trimmed
  }
  return DEFAULT_APPOINTMENT_DATE_LOCALE
}

export function getAppointmentDateInterpreterPrompt(locale?: string | null): string {
  return appointmentDateInterpreterPrompts[resolveAppointmentDateInterpreterLocale(locale)]
}
