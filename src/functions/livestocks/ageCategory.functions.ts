import { sendAgeGroupSelectionList } from '../../interactives/ageCategorySelection'
import { buildTriggerFunctions } from '../helpers'

export const ageCategoryFunctions: { [key: string]: (args: any) => Promise<any> } = buildTriggerFunctions([
  {
    name: 'selectAgeGroup',
    sendList: sendAgeGroupSelectionList,
    message: 'Lista interativa de grupos de idade enviada. Após escolher, enviaremos a lista de categorias correspondente.',
  },
])
