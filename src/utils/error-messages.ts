import { AppErrorCodes } from '../enums/constants'

const APP_ERROR_MESSAGES: Record<AppErrorCodes | string, string> = {
  [AppErrorCodes.GENERIC_API_ERROR]: 'Ocorreu um erro no sistema. Por favor, tente novamente.',
  [AppErrorCodes.DEFAULT_EXTERNAL_API_ERROR]: 'Ocorreu um erro ao comunicar com o sistema externo. Tente novamente mais tarde.',
  [AppErrorCodes.UNKNOWN_ERROR]: 'Ocorreu um erro inesperado. Por favor, entre em contato com o suporte.',
  [AppErrorCodes.UNAVAILABLE_ORIGIN_BALANCE]: 'Não há animais dessa categoria nesse lote.',
  [AppErrorCodes.UNAUTHORIZED_ACCESS]: 'Você não tem permissão para realizar esta ação.',
  [AppErrorCodes.USER_LACKS_PERMISSIONS]: 'O usuário não possui as permissões necessárias',

  ALIVE_WEIGHT_MIN: 'Peso vivo deve ser maior ou igual a 40 kg.',
  DEAD_WEIGHT_MIN: 'Peso morto deve ser maior ou igual a 40 kg.',
  DEAD_WEIGHT_MAX: 'Peso morto não pode ser maior que o peso vivo.',
  ARROBA_COST_INVALID: 'Custo da arroba deve ser maior ou igual a 1,00.',
  CARCASS_YIELD_RANGE: 'Rendimento de carcaça deve estar entre 0 e 100%.',
  QUANTITY_MIN: 'Quantidade deve ser maior ou igual a 1.',
  UNITY_COST_MIN: 'Valor unitário deve ser maior ou igual a 1,00.',
}

export function getAppErrorMessage(errorKey: AppErrorCodes | string | undefined): string {
  if (errorKey && APP_ERROR_MESSAGES[errorKey]) {
    return APP_ERROR_MESSAGES[errorKey]
  }
  return APP_ERROR_MESSAGES[AppErrorCodes.DEFAULT_EXTERNAL_API_ERROR]
}
