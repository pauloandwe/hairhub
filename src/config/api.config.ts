import axios from 'axios'
import { normalizeAxiosError } from '../errors/api-error'

const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeAxiosError(error)),
)

export function setApiBearerToken(token: string): void {
  api.defaults.headers.Authorization = `Bearer ${token}`
}

export function setApiRefreshToken(refreshToken: string): void {
  api.defaults.headers['refresh-token'] = refreshToken
}

export default api
