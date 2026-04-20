import { useState } from 'react'
import DiscoverTab from './components/DiscoverTab'
import StudiosTab from './components/StudiosTab'
import HintsTab from './components/HintsTab'
import PricingTab from './components/PricingTab'
import StudioPricingTab from './components/StudioPricingTab'
import InstructorsTab from './components/InstructorsTab'

type Tab = 'discover' | 'studios' | 'pricing' | 'your-pricing' | 'instructors' | 'hints'

const TABS: { key: Tab; label: string }[] = [
  { key: 'discover',     label: 'Discover'      },
  { key: 'studios',      label: 'Studios'       },
  { key: 'pricing',      label: 'Pricing'       },
  { key: 'your-pricing', label: 'Studio Pricing' },
  { key: 'instructors',  label: 'Instructors'   },
  { key: 'hints',        label: 'Hints'         },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('studios')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left vertical tab strip */}
      <nav className="w-40 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            StudioAnalyzer
          </span>
        </div>
        <div className="flex flex-col pt-2">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={[
                'text-left px-4 py-3 text-sm font-medium border-l-2 transition-colors',
                tab === key
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content — PricingTab manages its own scroll; others use overflow-y-auto */}
      <main className={`flex-1 ${tab === 'pricing' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
        {tab === 'discover'     && <DiscoverTab     />}
        {tab === 'studios'      && <StudiosTab      />}
        {tab === 'pricing'      && <PricingTab      />}
        {tab === 'your-pricing' && <StudioPricingTab />}
        {tab === 'instructors'  && <InstructorsTab  />}
        {tab === 'hints'        && <HintsTab        />}
      </main>
    </div>
  )
}
