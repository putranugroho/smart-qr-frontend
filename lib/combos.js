// utils/combos.js
export function parseComboToMenuItem(combo) {
  const id = combo.code ?? combo.id ?? `combo-${combo.id ?? Math.random().toString(36).slice(2,9)}`;
  const name = combo.name ?? combo.title ?? combo.itemName ?? id;
  const image = combo.imagePath || combo.image || (combo.comboGroups && combo.comboGroups[0] && combo.comboGroups[0].products && combo.comboGroups[0].products[0] && combo.comboGroups[0].products[0].imagePath) || "/images/gambar-menu.jpg";
  const description = combo.description ?? combo.note ?? "";

  let price = 0;
  if (Array.isArray(combo.comboGroups) && combo.comboGroups.length > 0) {
    price = combo.comboGroups.reduce((acc, g) => {
      const prods = Array.isArray(g.products) ? g.products : [];
      const positive = prods.find(p => Number(p.price || 0) > 0);
      if (positive) return acc + Number(positive.price || 0);
      return acc + Number(prods[0]?.price || 0);
    }, 0);
  } else if (combo.price != null) {
    price = Number(combo.price);
  }

  const taxes = Array.isArray(combo.taxes) && combo.taxes.length ? combo.taxes
    : (combo.comboGroups && combo.comboGroups[0] && combo.comboGroups[0].products && combo.comboGroups[0].products[0] && combo.comboGroups[0].products[0].taxes)
      ? combo.comboGroups[0].products[0].taxes
      : [];

  return {
    id,
    code: combo.code ?? combo.id,
    name,
    price,
    image,
    description,
    comboGroups: combo.comboGroups ?? [],
    taxes
  };
}
