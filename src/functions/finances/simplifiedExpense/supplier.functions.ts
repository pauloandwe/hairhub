import { sendSupplierSelectionList } from '../../../interactives/finances/supplierSelection'
import { buildTriggerFunctions } from '../../helpers'

export const supplierFunctions: { [key: string]: (args: any) => Promise<any> } = buildTriggerFunctions([
  {
    name: 'selectSupplier',
    sendList: sendSupplierSelectionList,
    message: 'Lista interativa de fornecedores enviada.',
  },
])
