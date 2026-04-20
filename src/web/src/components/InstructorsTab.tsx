import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { InstructorRow } from '@shared/types'

const CLASS_TYPE_OPTIONS = [
  'All types', 'Pilates', 'Yoga', 'Barre', 'Cycling', 'HIIT', 'Strength', 'Dance', 'Meditation', 'Boxing',
]

function SkeletonCard() {
  return (
    <div className="panel p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
        <div className="h-3 bg-gray-100 rounded w-4/6" />
      </div>
    </div>
  )
}

function InstructorCard({ instructor }: { instructor: InstructorRow }) {
  const initial = instructor.fullName.charAt(0).toUpperCase()
  const shownTypes = instructor.classTypes.slice(0, 3)

  const typeColors: Record<string, string> = {
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

  return (
    <div className="panel p-4 flex flex-col gap-3">
      {/* Header: photo + name + studio */}
      <div className="flex items-center gap-3">
        {instructor.photoUrl ? (
          <img
            src={instructor.photoUrl}
            alt={instructor.fullName}
            className="w-12 h-12 rounded-full object-cover shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-gray-500">{initial}</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{instructor.fullName}</p>
          {instructor.studioName && (
            <p className="text-xs text-gray-500 truncate">🏢 {instructor.studioName}</p>
          )}
          {instructor.workZipcode && (
            <p className="text-xs text-gray-400">{instructor.workZipcode}</p>
          )}
        </div>
      </div>

      {/* Class type pills */}
      {shownTypes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shownTypes.map((ct) => (
            <span
              key={ct}
              className={[
                'text-xs font-medium px-2 py-0.5 rounded-full',
                typeColors[ct] ?? 'bg-gray-100 text-gray-600',
              ].join(' ')}
            >
              {ct}
            </span>
          ))}
          {instructor.classTypes.length > 3 && (
            <span className="text-xs text-gray-400 px-1 py-0.5">+{instructor.classTypes.length - 3}</span>
          )}
        </div>
      )}

      {/* Bio */}
      {instructor.bio && (
        <p className="text-xs text-gray-600 line-clamp-3">{instructor.bio}</p>
      )}

      {/* Social links */}
      {(instructor.instagramHandle || instructor.linkedinUrl || instructor.email) && (
        <div className="flex items-center gap-3 mt-auto pt-1">
          {instructor.instagramHandle && (
            <a
              href={`https://www.instagram.com/${instructor.instagramHandle}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-pink-500 hover:text-pink-700 font-medium"
              title={`@${instructor.instagramHandle}`}
            >
              IG
            </a>
          )}
          {instructor.linkedinUrl && (
            <a
              href={instructor.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-700 font-medium"
              title="LinkedIn"
            >
              LI
            </a>
          )}
          {instructor.email && (
            <a
              href={`mailto:${instructor.email}`}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium truncate"
              title={instructor.email}
            >
              ✉
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function InstructorsTab() {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [classType, setClassType] = useState('')

  // Debounce text input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: instructors, isLoading } = useQuery({
    queryKey: ['instructors', debouncedQuery, classType],
    queryFn: () =>
      api.instructors.list({
        query: debouncedQuery || undefined,
        classType: classType || undefined,
      }),
  })

  return (
    <div className="p-8 max-w-7xl">
      <h2 className="text-base font-semibold text-gray-800 mb-6">Instructors</h2>

      {/* Search + filter bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          className="input w-72"
          placeholder="Search by name, studio, or class type…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="input w-44"
          value={classType}
          onChange={(e) => setClassType(e.target.value === 'All types' ? '' : e.target.value)}
        >
          {CLASS_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt === 'All types' ? '' : opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!instructors || instructors.length === 0) && (
        <div className="panel p-12 flex flex-col items-center justify-center text-center">
          <p className="text-3xl mb-4">🧘</p>
          <p className="text-gray-600 font-medium mb-1">No instructors found</p>
          <p className="text-xs text-gray-400">
            Use Discover → Find Instructors to scrape MindBody for a zip code.
          </p>
        </div>
      )}

      {/* Card grid */}
      {!isLoading && instructors && instructors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {instructors.map((instructor) => (
            <InstructorCard key={instructor.id} instructor={instructor} />
          ))}
        </div>
      )}
    </div>
  )
}
