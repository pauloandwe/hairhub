import { sendInstitutionSelectionList } from '../../interactives/institutionSelection'
import { buildTriggerFunctions } from '../helpers'

export const institutionFunctions: { [key: string]: (args: any) => Promise<any> } = buildTriggerFunctions([
  {
    name: 'listInstitutions',
    sendList: sendInstitutionSelectionList,
    message: 'Lista interativa de instituições enviada. Aguarde o usuário selecionar uma opção.',
  },
])
