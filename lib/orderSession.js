export function saveOrderSession(data) {
    const session = {
      sessionId: data.sessionId,
      orderCode: data.orderCode,
      name: data.name,
      phone: data.phone,
      createdAt: Date.now()
    }
  
    localStorage.setItem('active_order_session', JSON.stringify(session))
  }
  
  export function getOrderSession() {
    try {
      const raw = localStorage.getItem('active_order_session')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  
  export function clearOrderSession() {
    localStorage.removeItem('active_order_session')
  }
  