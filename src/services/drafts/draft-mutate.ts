export async function mutateDraft<T>(userId: string, load: (userId: string) => Promise<T>, save: (userId: string, draft: T) => Promise<void>, mutator: (draft: T) => void): Promise<T> {
  const draft = await load(userId)
  mutator(draft)
  await save(userId, draft)
  return draft
}

export async function mutateDraftGeneric<T>(userId: string, draft: T, save: (userId: string, draft: T) => Promise<void>, mutator: (draft: T) => void): Promise<T> {
  mutator(draft)
  await save(userId, draft)
  return draft
}
