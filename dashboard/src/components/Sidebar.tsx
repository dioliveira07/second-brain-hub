import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard", icon: "⚡" },
  { href: "/graph", label: "Grafo", icon: "🕸️" },
  { href: "/repos", label: "Repositórios", icon: "📦" },
  { href: "/playbook", label: "Playbook", icon: "📚" },
  { href: "/timeline", label: "Timeline", icon: "📅" },
  { href: "/activity", label: "Atividade", icon: "🔥" },
];

export function Sidebar() {
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-sm font-bold text-blue-400">🧠 Second Brain Hub</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <span>{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 text-xs text-gray-500 border-t border-gray-800">
        v0.1.0 — Fase 7
      </div>
    </aside>
  );
}
