import { v4 as uuid } from 'uuid'
import { getOrderSession } from './orderSession'

export function getOrCreateSessionId() {
  let sessionId = document.cookie
    .split('; ')
    .find(row => row.startsWith('order_session_id='))
    ?.split('=')[1]

  if (!sessionId) {
    sessionId = uuid()
    document.cookie = `order_session_id=${sessionId}; path=/; max-age=2592000`
  }

  return sessionId
}

export function getSavedOrderCode() {
    const session = getOrderSession()
    if (!session) return null
    return session.orderCode
  }