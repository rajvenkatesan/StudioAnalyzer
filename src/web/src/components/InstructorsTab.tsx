import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import type { InstructorRow } from '@shared/types'

const CLASS_TYPES = [
  'Pilates', 'Yoga', 'Barre', 'Cycling',
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

type SortColumn = 'fullName' | 'studioName' | 'address' | 'email' | 'classTypes' | 'detailsFetchedAt'
type SortDir    = 'asc' | 'desc'

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ instructor }: { instructor: InstructorRow }) {
  const [imgFailed, setImgFailed] = useState(false)
  const initial = instructor.fullName.charAt(0).toUpperCase()
  if (instructor.photoUrl && !imgFailed) {
    return (
      <img src={instructor.photoUrl} alt={instructor.fullName}
           className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-gray-100"
           onError={() => setImgFailed(true)} />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 ring-1 ring-gray-100">
      <span className="text-xs font-semibold text-indigo-600">{initial}</span>
    </div>
  )
}

function ClassTypePills({ types }: { types: string[] }) {
  if (types.length === 0) return <span className="text-gray-300 text-[10px]">—</span>
  return (
    <div className="flex flex-wrap gap-0.5">
      {types.slice(0, 2).map((ct) => (
        <span key={ct}
              className={['text-[9px] font-medium px-1 py-px rounded-full', TYPE_COLORS[ct] ?? 'bg-gray-100 text-gray-600'].join(' ')}>
          {ct}
        </span>
      ))}
      {types.length > 2 && <span className="text-[9px] text-gray-400">+{types.length - 2}</span>}
    </div>
  )
}

/** Icon-only social link — full text in tooltip */
function SocialIcon({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}
       onClick={(e) => e.stopPropagation()}
       className="inline-flex text-gray-400 hover:text-gray-700 transition-colors">
      {children}
    </a>
  )
}

function InstagramCell({ handle }: { handle: string | null }) {
  if (!handle) return <span className="text-gray-200 text-[10px]">—</span>
  return (
    <SocialIcon href={`https://www.instagram.com/${handle}/`} title={`@${handle}`}>
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    </SocialIcon>
  )
}

function LinkedInCell({ url }: { url: string | null }) {
  if (!url) return <span className="text-gray-200 text-[10px]">—</span>
  return (
    <SocialIcon href={url} title="LinkedIn profile">
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    </SocialIcon>
  )
}

function EmailCell({ email }: { email: string | null }) {
  if (!email) return <span className="text-gray-200 text-[10px]">—</span>
  return (
    <a href={`mailto:${email}`} title={email} onClick={(e) => e.stopPropagation()}
       className="text-[10px] text-gray-500 hover:text-gray-900 transition-colors truncate max-w-[110px] block">
      {email}
    </a>
  )
}

function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-gray-200 text-[10px]">—</span>
  return (
    <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()}
       className="text-[10px] text-gray-500 hover:text-gray-900 whitespace-nowrap">
      {phone}
    </a>
  )
}

function ExpandableBio({ bio }: { bio: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!bio) return <span className="text-gray-200 text-[10px]">—</span>
  const isLong = bio.length > 90
  return (
    <div className="text-[10px] text-gray-500 max-w-[200px]">
      <span>{expanded || !isLong ? bio : bio.slice(0, 90) + '…'}</span>
      {isLong && (
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                className="ml-1 text-indigo-400 hover:text-indigo-700 font-medium">
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  )
}

function StatusDot({ detailsFetchedAt, isEnriching }: { detailsFetchedAt: string | null; isEnriching: boolean }) {
  if (isEnriching) {
    return (
      <svg className="w-2.5 h-2.5 text-blue-500 animate-spin inline" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    )
  }
  if (detailsFetchedAt) {
    return <span className="text-green-500" title={`Details fetched ${new Date(detailsFetchedAt).toLocaleString()}`}>●</span>
  }
  return <span className="text-gray-200" title="URL only — no details fetched yet">○</span>
}

// ── XLSX export ───────────────────────────────────────────────────────────────

function exportToXlsx(rows: InstructorRow[]) {
  const data = rows.map((r) => ({
    'Name':              r.fullName,
    'Studio':            r.studioName ?? '',
    'Work Zipcode':      r.workZipcode ?? '',
    'Class Types':       r.classTypes.join(', '),
    'Email':             r.email ?? '',
    'Phone':             r.phone ?? '',
    'Instagram':         r.instagramHandle ? `@${r.instagramHandle}` : '',
    'LinkedIn':          r.linkedinUrl ?? '',
    'Hometown':          r.address ?? '',
    'Bio':               r.bio ?? '',
    'Profile URL':       r.sourceUrl ?? '',
    'Details Fetched':   r.detailsFetchedAt ? new Date(r.detailsFetchedAt).toLocaleString() : '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)

  // Column widths
  ws['!cols'] = [
    { wch: 28 }, // Name
    { wch: 28 }, // Studio
    { wch: 14 }, // Zipcode
    { wch: 30 }, // Class Types
    { wch: 30 }, // Email
    { wch: 16 }, // Phone
    { wch: 22 }, // Instagram
    { wch: 40 }, // LinkedIn
    { wch: 22 }, // Hometown
    { wch: 80 }, // Bio
    { wch: 60 }, // Profile URL
    { wch: 20 }, // Details Fetched
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Instructors')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `instructors-${date}.xlsx`)
}

/** Sortable column header — click cycles: asc → desc → unsorted */
function SortHeader({
  label, col, sortCol, sortDir, onSort, className = '',
}: {
  label: string
  col: SortColumn
  sortCol: SortColumn | null
  sortDir: SortDir
  onSort: (col: SortColumn) => void
  className?: string
}) {
  const active = sortCol === col
  return (
    <th
      className={`px-2 py-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px] cursor-pointer select-none hover:text-gray-600 whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <span className={`text-[9px] ${active ? 'text-indigo-500' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
        </span>
      </span>
    </th>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[10, 8, 24, 20, 20, 12, 8, 8, 20, 12, 36].map((w, i) => (
        <td key={i} className="px-2 py-2">
          <div className={`h-3 bg-gray-100 rounded w-${w}`} />
        </td>
      ))}
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InstructorsTab() {
  const queryClient = useQueryClient()

  const [searchInput,    setSearchInput]    = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected,       setSelected]       = useState<Set<number>>(new Set())

  // Multi-select class type filter (client-side, OR logic)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())

  // Sort state — cycling: none → asc → desc → none
  const [sortCol, setSortCol] = useState<SortColumn | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Map of id → timestamp when we *started* enriching that row.
  // Spinner clears only when detailsFetchedAt becomes NEWER than this timestamp.
  const [enrichStartTimes, setEnrichStartTimes] = useState<Map<number, number>>(new Map())

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: instructors, isLoading } = useQuery({
    queryKey: ['instructors', debouncedQuery],
    queryFn: () => api.instructors.list({ query: debouncedQuery || undefined }),
    refetchInterval: 5000,
  })

  // Clear spinner for rows whose detailsFetchedAt is now AFTER our start time.
  useEffect(() => {
    if (!instructors || enrichStartTimes.size === 0) return
    let changed = false
    const next = new Map(enrichStartTimes)
    for (const [id, startTime] of enrichStartTimes) {
      const row = instructors.find((r) => r.id === id)
      const fetchedAt = row?.detailsFetchedAt ? new Date(row.detailsFetchedAt).getTime() : 0
      if (fetchedAt > startTime) { next.delete(id); changed = true }
    }
    if (changed) setEnrichStartTimes(next)
  }, [instructors, enrichStartTimes])

  const enrichingIds = new Set(enrichStartTimes.keys())

  const enrichMutation = useMutation({
    mutationFn: (ids: number[]) => api.instructors.enrich({ ids }),
    onSuccess: (_data, ids) => {
      const now = Date.now()
      setEnrichStartTimes((prev) => {
        const next = new Map(prev)
        ids.forEach((id) => next.set(id, now))
        return next
      })
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ['instructors'] })
    },
  })

  // ── Sorting ───────────────────────────────────────────────────────────────
  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      if (sortDir === 'asc') { setSortDir('desc') }
      else                   { setSortCol(null); setSortDir('asc') }
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // ── Class type filter ─────────────────────────────────────────────────────
  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else                next.add(type)
      return next
    })
  }

  // ── Derived: filtered + sorted rows ──────────────────────────────────────
  const displayedInstructors = useMemo(() => {
    let rows = instructors ?? []

    // Class type filter — show rows that teach ANY of the selected types
    if (selectedTypes.size > 0) {
      rows = rows.filter((r) =>
        r.classTypes.some((ct) => selectedTypes.has(ct))
      )
    }

    // Sort
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        let aVal = '', bVal = ''
        switch (sortCol) {
          case 'fullName':         aVal = a.fullName;               bVal = b.fullName;              break
          case 'studioName':       aVal = a.studioName ?? '';       bVal = b.studioName ?? '';      break
          case 'address':          aVal = a.address ?? '';          bVal = b.address ?? '';         break
          case 'email':            aVal = a.email ?? '';            bVal = b.email ?? '';           break
          case 'classTypes':       aVal = a.classTypes[0] ?? '';    bVal = b.classTypes[0] ?? '';   break
          case 'detailsFetchedAt': aVal = a.detailsFetchedAt ?? ''; bVal = b.detailsFetchedAt ?? ''; break
        }
        const cmp = aVal.localeCompare(bVal)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [instructors, selectedTypes, sortCol, sortDir])

  const count    = displayedInstructors.length
  const allIds   = displayedInstructors.map((r) => r.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }, [allSelected, allIds])

  const toggleOne = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const handleGetDetails = () => {
    const ids = [...selected]
    if (ids.length === 0) return
    enrichMutation.mutate(ids)
  }

  return (
    <div className="p-6 max-w-[1500px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Instructors</h2>
          {!isLoading && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {count}{instructors && count !== instructors.length ? ` of ${instructors.length}` : ''} instructor{count !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-indigo-700 font-medium">{selected.size} selected</span>
              <button
                onClick={handleGetDetails}
                disabled={enrichMutation.isPending}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-2.5 py-1 rounded-md transition-colors"
              >
                {enrichMutation.isPending ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Queuing…
                  </>
                ) : '🔍 Get Details'}
              </button>
              <button onClick={() => setSelected(new Set())}
                      className="text-[10px] text-indigo-400 hover:text-indigo-700">✕</button>
            </div>
          )}

          <input className="input w-56 text-xs" placeholder="Search name, studio…"
                 value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />

          {instructors && instructors.length > 0 && (
            <button
              onClick={() => exportToXlsx(instructors)}
              title={`Export all ${instructors.length} instructors to Excel`}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 hover:border-gray-400 hover:text-gray-900 px-2.5 py-1.5 rounded-md transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 19l-2-3h1.2l1.3 2 1.3-2h1.2l-2 3H8.5zm4.3 0-2-3h1.2l1.3 2 1.3-2h1.2l-2 3h-1.0zm-8.3-5v-1h10v1H4.5z"/>
              </svg>
              Save as XLS
            </button>
          )}
        </div>
      </div>

      {/* Class type filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="text-[10px] text-gray-400 font-medium mr-1">Class type:</span>
        {CLASS_TYPES.map((type) => {
          const active = selectedTypes.has(type)
          const colorBase = TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600'
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={[
                'text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all',
                active
                  ? `${colorBase} border-transparent ring-1 ring-offset-1 ring-current`
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400',
              ].join(' ')}
            >
              {type}
            </button>
          )
        })}
        {selectedTypes.size > 0 && (
          <button
            onClick={() => setSelectedTypes(new Set())}
            className="text-[10px] text-gray-400 hover:text-gray-700 ml-1 underline"
          >
            clear
          </button>
        )}
      </div>

      {/* Empty state */}
      {!isLoading && count === 0 && (
        <div className="panel p-10 flex flex-col items-center justify-center text-center">
          <p className="text-3xl mb-3">🧘</p>
          <p className="text-gray-600 font-medium mb-1 text-sm">No instructors found</p>
          <p className="text-xs text-gray-400 max-w-sm">
            {selectedTypes.size > 0
              ? 'No instructors match the selected class type filter. Try clearing the filter.'
              : 'Use Discover → Find Instructors to scan MindBody, then select rows and click Get Details.'}
          </p>
        </div>
      )}

      {/* Table */}
      {(isLoading || count > 0) && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                           className="w-3 h-3 rounded border-gray-300 text-indigo-600 cursor-pointer" />
                  </th>
                  <th className="px-2 py-2 w-9" />
                  <SortHeader label="Name"       col="fullName"         sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortHeader label="Studio"     col="studioName"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortHeader label="Hometown"   col="address"          sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortHeader label="Class Types" col="classTypes"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-left" />
                  <th className="px-2 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide text-[10px]">IG</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide text-[10px]">LI</th>
                  <SortHeader label="Email"      col="email"            sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-left" />
                  <th className="px-2 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Phone</th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Bio</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : displayedInstructors.map((instructor) => {
                    const isSelected  = selected.has(instructor.id)
                    const isEnriching = enrichingIds.has(instructor.id)
                    return (
                      <tr key={instructor.id}
                          onClick={() => toggleOne(instructor.id)}
                          className={[
                            'border-t border-gray-100 cursor-pointer transition-colors',
                            isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50',
                          ].join(' ')}>

                        {/* Checkbox */}
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleOne(instructor.id)}
                                 className="w-3 h-3 rounded border-gray-300 text-indigo-600 cursor-pointer" />
                        </td>

                        {/* Avatar */}
                        <td className="px-2 py-2">
                          <Avatar instructor={instructor} />
                        </td>

                        {/* Name + status dot + zip */}
                        <td className="px-2 py-2 max-w-[120px]">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-medium text-gray-900 truncate" title={instructor.fullName}>
                              {instructor.fullName}
                            </span>
                            <StatusDot detailsFetchedAt={instructor.detailsFetchedAt} isEnriching={isEnriching} />
                          </div>
                          {instructor.workZipcode && (
                            <p className="text-[9px] text-gray-400 mt-px">{instructor.workZipcode}</p>
                          )}
                        </td>

                        {/* Studio + MB link */}
                        <td className="px-2 py-2 max-w-[140px]">
                          {instructor.studioName
                            ? <span className="text-gray-700 truncate block" title={instructor.studioName}>{instructor.studioName}</span>
                            : <span className="text-gray-200">—</span>
                          }
                          {instructor.sourceUrl && (
                            <a href={instructor.sourceUrl} target="_blank" rel="noopener noreferrer"
                               onClick={(e) => e.stopPropagation()}
                               className="text-[9px] text-indigo-400 hover:text-indigo-600 truncate block max-w-[130px]"
                               title={instructor.sourceUrl}>
                              MindBody ↗
                            </a>
                          )}
                        </td>

                        {/* Hometown */}
                        <td className="px-2 py-2 max-w-[100px]">
                          {instructor.address
                            ? <span className="text-gray-500 truncate block" title={instructor.address}>📍 {instructor.address}</span>
                            : <span className="text-gray-200">—</span>
                          }
                        </td>

                        {/* Class types */}
                        <td className="px-2 py-2">
                          <ClassTypePills types={instructor.classTypes} />
                        </td>

                        {/* Instagram */}
                        <td className="px-2 py-2 text-center">
                          <InstagramCell handle={instructor.instagramHandle} />
                        </td>

                        {/* LinkedIn */}
                        <td className="px-2 py-2 text-center">
                          <LinkedInCell url={instructor.linkedinUrl} />
                        </td>

                        {/* Email */}
                        <td className="px-2 py-2">
                          <EmailCell email={instructor.email} />
                        </td>

                        {/* Phone */}
                        <td className="px-2 py-2">
                          <PhoneCell phone={instructor.phone} />
                        </td>

                        {/* Bio */}
                        <td className="px-2 py-2">
                          <ExpandableBio bio={instructor.bio} />
                        </td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
