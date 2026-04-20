import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

export default function HintsTab() {
  const [content, setContent]     = useState<string>('')
  const [original, setOriginal]   = useState<string>('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [savedMsg, setSavedMsg]   = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const timerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load on mount
  useEffect(() => {
    api.hints.get()
      .then((text) => { setContent(text); setOriginal(text) })
      .catch(() => setError('Failed to load StudioHelper.md'))
      .finally(() => setLoading(false))
  }, [])

  const isDirty = content !== original

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      await api.hints.put(content)
      setOriginal(content)
      setSavedMsg('Saved!')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setSavedMsg(null), 2_500)
    } catch {
      setError('Failed to save. Check that the API server is running.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setContent(original)
    setError(null)
    setSavedMsg(null)
  }

  return (
    <div className="p-8 max-w-4xl flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">Scraping Hints</h2>
        <p className="text-sm text-gray-500">
          Tell the scraper where to find schedule and pricing data for specific studio brands.
          Edit <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">StudioHelper.md</code> below,
          then click <strong>Save</strong>. Hints take effect on the next refresh or discovery run.
        </p>
      </div>

      {/* Format reference */}
      <details className="panel p-4 text-sm text-gray-600">
        <summary className="cursor-pointer font-medium text-gray-700 select-none">
          Format reference
        </summary>
        <div className="mt-3 space-y-2 text-xs leading-relaxed">
          <p>Each brand gets a <code className="bg-gray-100 px-1 rounded font-mono">## BrandName</code> section.
             The brand name is matched case-insensitively against the normalized name in the database
             (letters and digits only — punctuation and spaces are stripped).</p>
          <table className="w-full border-collapse mt-2">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-1 pr-4 font-medium">Key</th>
                <th className="pb-1 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-100">
                <td className="py-1.5 pr-4 font-mono text-indigo-700 whitespace-nowrap">locations_page</td>
                <td className="py-1.5">
                  Full URL of the page that lists all studio locations.
                  The scraper spiders it for location sub-page links, then scrapes each one.
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 pr-4 font-mono text-indigo-700 whitespace-nowrap">schedule_page</td>
                <td className="py-1.5">
                  Path (e.g. <code className="bg-gray-100 px-1 rounded font-mono">/classes</code>) or full URL
                  for the class schedule. Relative paths are resolved against the studio's website URL.
                </td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-mono text-indigo-700 whitespace-nowrap">pricing_page</td>
                <td className="py-1.5">
                  Path or full URL for pricing / membership plans.
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 bg-gray-50 rounded p-3 font-mono text-xs leading-5 whitespace-pre">
{`## jetsetpilates
locations_page: https://jetsetpilates.com/locations

## solidcore
schedule_page: /classes
pricing_page: /pricing`}
          </div>
        </div>
      </details>

      {/* Editor */}
      <div className="panel overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">StudioHelper.md</span>
          <div className="flex items-center gap-3">
            {savedMsg && (
              <span className="text-xs text-green-600 font-medium">{savedMsg}</span>
            )}
            {error && (
              <span className="text-xs text-red-600">{error}</span>
            )}
            {isDirty && !saving && (
              <button
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Discard
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty || loading}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-400">Loading…</div>
        ) : (
          <textarea
            className="w-full font-mono text-xs leading-5 p-4 resize-none outline-none bg-white
                       border-0 focus:ring-0 min-h-[480px]"
            value={content}
            onChange={(e) => { setContent(e.target.value); setSavedMsg(null) }}
            spellCheck={false}
            placeholder="# StudioHelper&#10;&#10;## yourbrand&#10;schedule_page: /classes"
          />
        )}
      </div>

      <p className="text-xs text-gray-400">
        Changes are saved to <code className="font-mono">StudioHelper.md</code> in the project root.
        Hints are re-read on every scrape — no server restart needed.
      </p>
    </div>
  )
}
