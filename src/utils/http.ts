export function unwrapApiResponse<T = unknown>(response: any): T | undefined {
  const topLevel = response?.data

  if (topLevel && typeof topLevel === 'object' && !Array.isArray(topLevel) && 'data' in topLevel) {
    const firstLevel = (topLevel as any).data

    if (firstLevel && typeof firstLevel === 'object' && !Array.isArray(firstLevel) && 'data' in firstLevel) {
      return (firstLevel as any).data as T
    }

    return firstLevel as T
  }

  return topLevel as T
}
