import { useState, useEffect } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Sparkles } from 'lucide-react'

const FALLBACK_TRIVIA: { title: string; content: string; source_detail: string; url?: string }[] = [
  {
    title: 'The Birth of City Pop',
    content: "City Pop emerged in late 1970s Japan during the economic asset boom. It blended Western soft rock, jazz fusion, boogie, and R&B with advanced Japanese synthesizer tech like the Yamaha DX7.",
    source_detail: 'NEOTOKYOFM',
  },
  {
    title: 'The Plastic Love Phenomenon',
    content: "Mariya Takeuchi's 1984 masterpiece 'Plastic Love' became a viral global sensation in 2017 due to YouTube's recommendation algorithm, drawing millions of Western listeners to City Pop.",
    source_detail: 'NEOTOKYOFM',
  },
  {
    title: 'FM Radio & Cassette Culture',
    content: "In 80s Tokyo, cassette decks and car stereos were the ultimate luxury. FM Station magazines were printed with custom cassette labels so listeners could record radio broadcasts.",
    source_detail: 'NEOTOKYOFM',
  },
]

export default function TriviaSection() {
  const [triviaIndex, setTriviaIndex] = useState(0)
  const [items, setItems] = useState(FALLBACK_TRIVIA)
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState(0)

  useEffect(() => {
    fetchTrivia()
  }, [])

  const fetchTrivia = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trivia/citypop')
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      if (data.items?.length > 0) {
        setItems(data.items)
        setLastFetched(Date.now())
      }
    } catch {
      // keep existing items or fallback
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => setTriviaIndex((prev) => (prev + 1) % items.length)
  const handlePrev = () => setTriviaIndex((prev) => (prev - 1 + items.length) % items.length)
  const currentTrivia = items[triviaIndex]

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3 h-full justify-between glass shadow-2xl bg-black/30 backdrop-blur-md border border-white/5">
      {/* Header */}
      <div className="flex justify-between items-center pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <BookOpen size={16} className="text-neon-pink" />
          <span className="font-mono text-xs font-bold text-gray-300 tracking-wider">CITY POP NEWS</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTrivia}
            disabled={loading}
            className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-neon-cyan transition-colors disabled:opacity-30"
            title="Refresh news"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="font-mono text-[9px] text-gray-500">
            <span>{triviaIndex + 1}</span>
            <span>/</span>
            <span>{items.length}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center py-2 text-left">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={12} className="text-neon-cyan animate-pulse" />
          <span className="font-sans text-xs font-bold text-neon-pink tracking-wide uppercase">{currentTrivia.title}</span>
        </div>
        <p className="font-sans text-[11px] text-gray-300 leading-relaxed font-medium">{currentTrivia.content}</p>
        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-dashed border-neutral-800/60 font-mono text-[9px] text-gray-500">
          <div>
            <span className="text-gray-600 mr-1 uppercase">SOURCE:</span>
            <span className="text-gray-400 font-bold">{currentTrivia.source_detail || 'NEOTOKYOFM'}</span>
          </div>
          {currentTrivia.url && (
            <a
              href={currentTrivia.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-neon-cyan hover:text-neon-pink transition-colors"
            >
              <ExternalLink size={9} />
              <span>LINK</span>
            </a>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center border-t border-white/5 pt-2">
        <span className="font-mono text-[9px] text-gray-500 uppercase select-none">
          {lastFetched > 0 ? `UPDATED ${new Date(lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'NEOTOKYOFM'}
        </span>
        <div className="flex gap-1.5">
          <button onClick={handlePrev} className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={handleNext} className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
