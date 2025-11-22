// components/Features.js
const items = [
  { title: 'Pemindaian Cepat', desc: 'Scan QR di meja atau produk, buka menu/halaman langsung.' },
  { title: 'Session-based', desc: 'Tanpa login — personalisasi lewat session.' },
  { title: 'PWA-ready', desc: 'Bisa dibuat installable (opsional).' },
]

export default function Features() {
  return (
    <section id="features" className="py-12">
      <div className="container">
        <h2 className="text-2xl font-semibold">Fitur Utama</h2>
        <p className="text-gray-600 mt-2 max-w-2xl">Solusi cepat untuk interaksi pelanggan — dari menu, promo, hingga pembayaran.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {items.map((it) => (
            <div key={it.title} className="card">
              <div className="font-semibold">{it.title}</div>
              <p className="text-sm text-gray-600 mt-2">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
