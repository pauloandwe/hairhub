import { sendDeathCauseSelectionList } from '../../interactives/deathCauseSelection'
import { buildTriggerFunctions } from '../helpers'

export const deathCauseFunctions: { [key: string]: (args: any) => Promise<any> } = buildTriggerFunctions([
  {
    name: 'selectDeathCause',
    sendList: sendDeathCauseSelectionList,
    message: 'Lista interativa de causas de morte enviada. Aguarde o usuário selecionar uma opção.',
  },
])
