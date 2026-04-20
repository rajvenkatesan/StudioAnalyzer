import { NavLink } from 'react-router-dom'

const links = [
  { to: '/',           label: 'Dashboard' },
  { to: '/studios',    label: 'Studios'   },
  { to: '/comparison', label: 'Compare'   },
  { to: '/runs',       label: 'Runs'      },
]

export default function NavBar() {
  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-8 h-14">
        <span className="font-bold text-brand-600 text-lg tracking-tight">
          StudioAnalyzer
        </span>
        <div className="flex gap-1">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
