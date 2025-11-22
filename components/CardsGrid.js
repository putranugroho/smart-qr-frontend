// components/CardsGrid.js
export default function CardsGrid({ items = [] }) {
  return (
    <section className="py-12">
      <div className="container">
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((it, idx) => (
            <div key={idx} className="card">
              <div className="text-sm text-gray-500">{it.category}</div>
              <h3 className="font-semibold mt-2">{it.title}</h3>
              <p className="text-gray-600 mt-2 text-sm">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
