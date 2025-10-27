import { sendWhatsAppMessage } from '../api/meta.api'
import { DeathCauseService } from '../services/livestocks/death-cause.service'
import { getUserContext, setUserContext, getUserContextSync } from '../env.config'
import { createSelectionFlow } from './flows'
import { updateDraftWithDeathCause, UpsertArgs } from '../services/livestocks/death-draft.service'
import { tryContinueRegistration } from './followup'
import { SelectArrayItem } from '../helpers/converters/converters.type'
import { deathFunctions } from '../functions/livestocks/death/death.functions'
import { DeathField } from '../enums/cruds/deathFields.enums'

export const DEATH_CAUSE_NAMESPACE = 'DEATH_CAUSE'

const deathCauseFlow = createSelectionFlow<SelectArrayItem>({
  namespace: DEATH_CAUSE_NAMESPACE,
  type: 'selectDeathCause',
  fetchItems: async () => {
    const service = new DeathCauseService()
    return service.listDeathCauses()
  },
  ui: {
    header: 'Qual foi a causa?',
    sectionTitle: 'Causas',
    footer: 'Inttegra',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Me ajuda a anotar qual foi a causa dessa morte.',
  invalidSelectionMsg: 'Opa, essa opção expirou. Deixe eu enviar de novo pra você.',
  emptyListMessage: 'Nenhuma causa de morte encontrada',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Selecionar',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)
    const context = getUserContextSync(userId)
    const isEditMode = !!context?.activeRegistration?.editMode

    await setUserContext(userId, {
      deathCauseId: item.id,
      deathCauseName: item.name,
    })
    if (!isEditMode && getUserContextSync(userId)?.activeRegistration?.type === 'death') {
      await updateDraftWithDeathCause(userId, { id: item.id, name: item.name })
    }
    await sendWhatsAppMessage(userId, `Beleza! Causa de morte registrada: '${item.name}'.`)
    if (isEditMode) {
      const updates: Partial<UpsertArgs> = {
        [DeathField.DeathCause]: { id: item.id, name: item.name },
      }

      await deathFunctions.applyDeathRecordUpdates({
        phone: userId,
        updates,
        logContext: `Causa de morte atualizada para ${item.name}`,
      })
      return
    }
    await tryContinueRegistration(userId)
  },
})

export async function sendDeathCauseSelectionList(userId: string, bodyMsg = 'Antes de continuar, selecione a causa de morte desejada.', offset = 0) {
  await deathCauseFlow.sendList(userId, bodyMsg, offset)
}
