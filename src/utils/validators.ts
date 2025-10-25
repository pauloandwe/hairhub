export interface ValidationResult {
  valid: boolean
  error?: string
}

export const validateNumberRange = (value: unknown, min: number, max: number, options: { allowNull?: boolean; fieldName?: string } = {}): ValidationResult => {
  const { allowNull = false, fieldName = 'field' } = options

  if (value === null || value === undefined) {
    return allowNull ? { valid: true } : { valid: false, error: `${fieldName} is required` }
  }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a valid number` }
  }

  if (num < min || num > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}` }
  }

  return { valid: true }
}

export const validateMinValue = (value: unknown, min: number, options: { allowNull?: boolean; fieldName?: string } = {}): ValidationResult => {
  const { allowNull = false, fieldName = 'field' } = options

  if (value === null || value === undefined) {
    return allowNull ? { valid: true } : { valid: false, error: `${fieldName} is required` }
  }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a valid number` }
  }

  if (num < min) {
    return { valid: false, error: `${fieldName} must be greater than or equal to ${min}` }
  }

  return { valid: true }
}

export const validateMaxValue = (value: unknown, max: number, options: { allowNull?: boolean; fieldName?: string } = {}): ValidationResult => {
  const { allowNull = false, fieldName = 'field' } = options

  if (value === null || value === undefined) {
    return allowNull ? { valid: true } : { valid: false, error: `${fieldName} is required` }
  }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a valid number` }
  }

  if (num > max) {
    return { valid: false, error: `${fieldName} must be less than or equal to ${max}` }
  }

  return { valid: true }
}

export const validateInteger = (value: unknown, options: { allowNull?: boolean; fieldName?: string; min?: number } = {}): ValidationResult => {
  const { allowNull = false, fieldName = 'field', min = 0 } = options

  if (value === null || value === undefined) {
    return allowNull ? { valid: true } : { valid: false, error: `${fieldName} is required` }
  }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a valid number` }
  }

  if (!Number.isInteger(num)) {
    return { valid: false, error: `${fieldName} must be an integer` }
  }

  if (num < min) {
    return { valid: false, error: `${fieldName} must be greater than or equal to ${min}` }
  }

  return { valid: true }
}

export const validateFieldRelation = (value1: unknown, value2: unknown, operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq', options: { field1Name?: string; field2Name?: string } = {}): ValidationResult => {
  const { field1Name = 'field1', field2Name = 'field2' } = options

  const num1 = typeof value1 === 'number' ? value1 : Number(value1)
  const num2 = typeof value2 === 'number' ? value2 : Number(value2)

  if (!Number.isFinite(num1) || !Number.isFinite(num2)) {
    return { valid: false, error: `Both ${field1Name} and ${field2Name} must be valid numbers` }
  }

  let isValid = false
  let operatorLabel = ''

  switch (operator) {
    case 'gt':
      isValid = num1 > num2
      operatorLabel = 'greater than'
      break
    case 'gte':
      isValid = num1 >= num2
      operatorLabel = 'greater than or equal to'
      break
    case 'lt':
      isValid = num1 < num2
      operatorLabel = 'less than'
      break
    case 'lte':
      isValid = num1 <= num2
      operatorLabel = 'less than or equal to'
      break
    case 'eq':
      isValid = num1 === num2
      operatorLabel = 'equal to'
      break
    case 'neq':
      isValid = num1 !== num2
      operatorLabel = 'not equal to'
      break
  }

  if (!isValid) {
    return {
      valid: false,
      error: `${field1Name} must be ${operatorLabel} ${field2Name}`,
    }
  }

  return { valid: true }
}

export const validateId = (value: unknown, options: { allowNull?: boolean; fieldName?: string } = {}): ValidationResult => {
  const { allowNull = false, fieldName = 'id' } = options

  if (value === null || value === undefined) {
    return allowNull ? { valid: true } : { valid: false, error: `${fieldName} is required` }
  }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
    return { valid: false, error: `${fieldName} must be a valid positive integer` }
  }

  return { valid: true }
}
