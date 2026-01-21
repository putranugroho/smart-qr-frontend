// utils/normalizeMacroToCombo.js

export function normalizeMacroToComboDetail(macroCombo, macroMeta = {}) {
  if (!macroCombo) return null

  return {
    id: macroCombo.id ?? macroCombo.code,
    code: macroCombo.code,
    name: macroCombo.name,
    description: macroCombo.description ?? '',
    image: macroCombo.imagePath ?? null,

    // 🔥 PENTING: ComboDetail HANYA BACA comboGroups
    comboGroups: (macroCombo.comboGroups || []).map(group => ({
      code: group.code,
      name: group.name,
      allowSkip: !!group.allowSkip,
      activeCondiment: !!group.activeCondiment,

      products: (group.products || []).map(p => ({
        code: p.code,
        name: p.name,
        itemName: p.itemName,
        imagePath: p.imagePath,
        description: p.description ?? '',
        qty: p.qty ?? 1,
        price: Number(p.price) || 0,
        maskingprice: p.maskingprice ?? 0,
        outOfStock: !!p.outOfStock,

        taxes: p.taxes || [],

        // 🚨 ComboDetail EXPECT condimentGroups ADA
        condimentGroups: p.condimentGroups || []
      }))
    })),

    // metadata tambahan (aman, tidak dipakai UI)
    __isMacro: true,
    __macroCode: macroMeta.macroCode,
    __macroName: macroMeta.macroName
  }
}
