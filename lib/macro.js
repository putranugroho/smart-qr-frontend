import { getCart, removeCartAtIndex } from './cart'

/**
 * Ambil semua item macro di cart
 */
export function getMacroItemsFromCart(cart = []) {
  return cart.filter(
    item =>
      item?.type === 'combo' &&
      item?.combos?.[0]?.isFromMacro === true
  )
}

/**
 * Hitung qty macro berdasarkan macroCode
 */
export function getMacroQtyMap(cart = []) {
  const map = {}

  getMacroItemsFromCart(cart).forEach(item => {
    const macroCode = item?.combos?.[0]?.macroCode
    if (!macroCode) return

    map[macroCode] = (map[macroCode] || 0) + Number(item.qty || 1)
  })

  return map
}

/**
 * RULE 1 + 5
 * Filter macro API berdasarkan cart
 */
export function filterMacrosByCart(apiMacros, cart = []) {
  const macroQtyMap = getMacroQtyMap(cart)
  const selectedMacroCodes = Object.keys(macroQtyMap)

  return apiMacros
    .map(macro => {
      const takenQty = macroQtyMap[macro.macroCode] || 0

      // ❌ rule maxQuantityCanGet
      if (
        macro.maxQuantityCanGet > 0 &&
        takenQty >= macro.maxQuantityCanGet
      ) {
        return null
      }

      // ❌ rule isAllowGetAnother
      if (
        selectedMacroCodes.length > 0 &&
        macro.isAllowGetAnother === false &&
        !macroQtyMap[macro.macroCode]
      ) {
        return null
      }

      return macro
    })
    .filter(Boolean)
}

/**
 * RULE 4 + 6
 * Sinkronkan cart dengan response macro API
 */
export function syncCartWithMacroAPI(apiMacros, cart = []) {
  const apiMacroCodes = apiMacros.map(m => m.macroCode)

  cart.forEach((item, index) => {
    if (
      item?.type === 'combo' &&
      item?.combos?.[0]?.isFromMacro
    ) {
      const macroCode = item.combos[0].macroCode
      const isStillEligible = apiMacroCodes.includes(macroCode)

      if (!isStillEligible) {
        removeCartAtIndex(index)
      }
    }
  })
}

/**
 * RULE 6
 * Jika ambil macro baru, hapus macro lama yg isAllowGetAnother=false
 */
export function enforceSingleMacroRule(newMacro, cart = []) {
  cart.forEach((item, index) => {
    if (
      item?.type === 'combo' &&
      item?.combos?.[0]?.isFromMacro
    ) {
      const oldMacro = item.combos[0]

      if (
        oldMacro.isAllowGetAnother === false &&
        newMacro.isAllowGetAnother === true
      ) {
        removeCartAtIndex(index)
      }
    }
  })
}