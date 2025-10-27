import { sendFarmSelectionList } from '../../interactives/farmSelection'
import { buildTriggerFunctions } from '../helpers'

export const farmsFunctions: { [key: string]: (args: any) => Promise<any> } = buildTriggerFunctions([
  {
    name: 'listFarms',
    sendList: sendFarmSelectionList,
    message: 'Lista interativa de fazendas enviada. Aguarde o usuário selecionar uma opção.',
  },
])
