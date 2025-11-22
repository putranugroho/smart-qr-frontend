export default function Layout({ children }) {
return (
<div className="min-h-screen flex flex-col bg-white">
<header className="bg-white shadow-sm">
<div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
<div className="text-xl font-semibold">Smart QR</div>
<nav className="text-sm text-gray-600 space-x-4 hidden md:block">
<a href="#features">Fitur</a>
<a href="#contact">Kontak</a>
</nav>
</div>
</header>
<main className="flex-1">{children}</main>
<footer className="bg-gray-50 text-center py-4 text-sm">© {new Date().getFullYear()} Smart QR</footer>
</div>
)
}