import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { InstructorRow } from '@shared/types'

const CLASS_TYPE_OPTIONS = [
  'All types', 'Pilates', 'Yoga', 'Barre', 'Cycling',
  'HIIT', 'Strength', 'Dance', 'Meditation', 'Boxing',
]

const TYPE_COLORS: Record<string, string> = {
  Pilates:    'bg-pink-100 text-pink-700',
  Yoga:       'bg-purple-100 text-purple-700',
  Barre:      'bg-rose-100 text-rose-700',
  Cycling:    'bg-orange-100 text-orange-700',
  HIIT:       'bg-red-100 text-red-700',
  Strength:   'bg-blue-100 text-blue-700',
  Dance:      'bg-yellow-100 text-yellow-700',
  Meditation: 'bg-green-100 text-green-700',
  Boxing:     'bg-gray-700 text-white',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ instructor }: { instructor: InstructorRow }) {
  const [imgFailed, setImgFailed] = useState(false)
  const initial = instructor.fullName.charAt(0).toUpperCase()

  if (instructor.photoUrl && !imgFailed) {
    return (
      <img
        src={instructor.photoUrl}
        alt={instructor.fullName}
        className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-gray-100"
        onError={() => setImgFailed(true)}
      />
    )
  }
  return (
    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 ring-1 ring-gray-100">
      <span className="text-sm font-semibold text-indigo-600">{initial}</span>
    </div>
  )
}

function ClassTypePills({ types }: { types: string[] }) {
  if (types.length === 0) return <span className="text-gray-300 text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {types.slice(0, 3).map((ct) => (
        <span
          key={ct}
          className={['text-[10px] font-medium px-1.5 py-0.5 rounded-full', TYPE_COLORS[ct] ?? 'bg-gray-100 text-gray-600'].join(' ')}
        >
          {ct}
        </span>
      ))}
      {types.length > 3 && (
        <span className="text-[10px] text-gray-400">+{types.length - 3}</span>
      )}
    </div>
  )
}

function InstagramCell({ handle }: { handle: string | null }) {
  if (!handle) return <span className="text-gray-300 text-xs">—</span>
  return (
    <a
      href={`https://www.instagram.com/${handle}/`}
      target="_blank" rel="noopener noreferrer"
      title={`@${handle}`}
      className="flex items-center gap-1 text-pink-500 hover:text-pink-700 transition-colors text-xs"
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
      <span className="truncate max-w-[80px]">@{handle}</span>
    </a>
  )
}

function LinkedInCell({ url }: { url: string | null }) {
  if (!url) return <span className="text-gray-300 text-xs">—</span>
  return (
    <a
      href={url}
      target="_blank" rel="noopener noreferrer"
      title="LinkedIn profile"
      className="flex items-center gap-1 text-blue-500 hover:text-blue-700 transition-colors text-xs"
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
      <span>Profile</span>
    </a>
  )
}

function EmailCell({ email }: { email: string | null }) {
  if (!email) return <span className="text-gray-300 text-xs">—</span>
  return (
    <a
      href={`mailto:${email}`}
      title={email}
      className="text-xs text-gray-600 hover:text-gray-900 transition-colors truncate max-w-[140px] block"
    >
      {email}
    </a>
  )
}

function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-gray-300 text-xs">—</span>
  return (
    <a
      href={`tel:${phone}`}
      title={phone}
      className="text-xs text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
    >
      {phone}
    </a>
  )
}

function ExpandableBio({ bio }: { bio: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!bio) return <span className="text-gray-300 text-xs">—</span>
  const isLong = bio.length > 120
  return (
    <div className="text-xs text-gray-600 max-w-xs">
      <span>{expanded || !isLong ? bio : bio.slice(0, 120) + '…'}</span>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-indigo-500 hover:text-indigo-700 font-medium"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="w-10 h-10 rounded-full bg-gray-200" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-28" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-24" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-20" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-20" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-24" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-28" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-48" /></td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InstructorsTab() {
  const [searchInput,    setSearchInput]    = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [classType,      setClassType]      = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: instructors, isLoading } = useQuery({
    queryKey: ['instructors', debouncedQuery, classType],
    queryFn: () =>
      api.instructors.list({
        query:     debouncedQuery || undefined,
        classType: classType     || undefined,
      }),
    refetchInterval: 8000,   // poll every 8 s so UI updates during active discovery
  })

  const count = instructors?.length ?? 0

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Instructors</h2>
          {!isLoading && count > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{count} instructor{count !== 1 ? 's' : ''}</p>
          )}
        </div>

        {/* Search + filter */}
        <div className="flex gap-2">
          <input
            className="input w-64"
            placeholder="Search name, studio, class type…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="input w-40"
            value={classType}
            onChange={(e) => setClassType(e.target.value === 'All types' ? '' : e.target.value)}
          >
            {CLASS_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt === 'All types' ? '' : opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && count === 0 && (
        <div className="panel p-12 flex flex-col items-center justify-center text-center">
          <p className="text-3xl mb-4">🧘</p>
          <p className="text-gray-600 font-medium mb-1">No instructors found</p>
          <p className="text-xs text-gray-400 max-w-sm">
            Use <strong>Discover → Find Instructors</strong> to scrape MindBody for a zip code,
            then come back here to browse results.
          </p>
        </div>
      )}

      {/* Table */}
      {(isLoading || count > 0) && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">
                    Photo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Studio
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Class Types
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Instagram
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    LinkedIn
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Bio
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : instructors!.map((instructor) => (
                    <tr
                      key={instructor.id}
                      className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      {/* Photo */}
                      <td className="px-4 py-3">
                        <Avatar instructor={instructor} />
                      </td>

                      {/* Name + zipcode */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 whitespace-nowrap">{instructor.fullName}</p>
                        {instructor.workZipcode && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{instructor.workZipcode}</p>
                        )}
                      </td>

                      {/* Studio */}
                      <td className="px-4 py-3">
                        {instructor.studioName
                          ? <span className="text-gray-700 whitespace-nowrap">{instructor.studioName}</span>
                          : <span className="text-gray-300">—</span>
                        }
                        {instructor.sourceUrl && (
                          <a
                            href={instructor.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[10px] text-indigo-400 hover:text-indigo-600 mt-0.5 max-w-[140px] truncate"
                            title={instructor.sourceUrl}
                          >
                            View on MindBody ↗
                          </a>
                        )}
                      </td>

                      {/* Class types */}
                      <td className="px-4 py-3">
                        <ClassTypePills types={instructor.classTypes} />
                      </td>

                      {/* Instagram */}
                      <td className="px-4 py-3">
                        <InstagramCell handle={instructor.instagramHandle} />
                      </td>

                      {/* LinkedIn */}
                      <td className="px-4 py-3">
                        <LinkedInCell url={instructor.linkedinUrl} />
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3">
                        <EmailCell email={instructor.email} />
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3">
                        <PhoneCell phone={instructor.phone} />
                      </td>

                      {/* Bio */}
                      <td className="px-4 py-3">
                        <ExpandableBio bio={instructor.bio} />
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
