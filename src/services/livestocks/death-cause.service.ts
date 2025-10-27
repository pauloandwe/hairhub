import { DeathCause, DeathCauseLabels } from '../../enums/deathCauses.enums'
import { convertEnumToSelectArray } from '../../helpers/converters/converters'
import { SelectArrayItem } from '../../helpers/converters/converters.type'

export class DeathCauseService {
  async listDeathCauses(): Promise<SelectArrayItem[]> {
    return convertEnumToSelectArray(DeathCause, DeathCauseLabels)
  }
}
