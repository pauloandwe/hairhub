export const isTokenExpired = (token: string): boolean => {
  try {
    const fixedToken = token?.replace(/-/g, '+')?.replace(/_/g, '/')
    const payloadSegment = fixedToken.split('.')[1]
    if (!payloadSegment) return false
    const decodedPayload = JSON.parse(Buffer.from(payloadSegment, 'base64').toString('utf8'))
    if (!decodedPayload.exp) return false
    const expiration = decodedPayload.exp * 1000
    return Date.now() >= expiration
  } catch {
    return false
  }
}
