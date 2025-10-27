import { sendLocationSelectionList } from '../../interactives/locationSelection'
import { buildTriggerFunctions } from '../helpers'

export const locationSelectionFunctions: {
  [key: string]: (args: any) => Promise<any>
} = buildTriggerFunctions([
  {
    name: 'selectLocation',
    sendList: sendLocationSelectionList,
    message: 'Lista interativa de localizações enviada. Aguarde o usuário selecionar uma opção.',
  },
])
