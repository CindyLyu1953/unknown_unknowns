import { useState, useRef, useCallback, useEffect } from 'react';
import type { Concept } from '../data/concepts';
import { CONTINENT_META } from '../data/concepts';

interface Props {
  concepts: Concept[];
  onSelect: (id: string) => void;
}

export default function SearchBar({ concepts, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length < 1 ? [] :
    concepts
      .filter(c => c.name.toLowerCase().includes(query.toLowerCase()) ||
                   c.region.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);

  useEffect(() => { setHighlighted(0); }, [query]);

  const handleSelect = useCallback((id: string) => {
    onSelect(id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && results[highlighted]) handleSelect(results[highlighted].id);
    if (e.key === 'Escape') { setQuery(''); setOpen(false); }
  }, [results, highlighted, handleSelect]);

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 px-3 h-9 rounded-sm"
        style={{
          background: 'rgba(8,14,24,0.92)',
          border: '1px solid rgba(200,169,110,0.2)',
          width: 240,
        }}
      >
        <span style={{ color: 'rgba(200,169,110,0.5)', fontSize: 12 }}>⌕</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search all data science concepts and regions"
          aria-expanded={open}
          aria-controls="concept-search-results"
          aria-autocomplete="list"
          aria-activedescendant={results[highlighted] ? `search-result-${results[highlighted].id}` : undefined}
          placeholder="Search concepts..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{
            color: '#f0e6c8',
            fontFamily: '"Cinzel", serif',
            letterSpacing: '0.02em',
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { setQuery(''); setOpen(false); }}
            className="w-8 h-8 flex items-center justify-center"
            style={{ color: 'rgba(200,169,110,0.55)', fontSize: 10 }}
          >
            ✕
          </button>
        )}
      </div>

      {open && query.trim().length > 0 && (
        <div
          id="concept-search-results"
          role="listbox"
          ref={listRef}
          className="absolute top-full mt-1 right-0 rounded-sm overflow-hidden z-50"
          style={{
            background: 'rgba(8,14,24,0.98)',
            border: '1px solid rgba(200,169,110,0.15)',
            width: 280,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm" style={{ color: 'rgba(240,230,200,0.55)' }}>
              No places found. Try a broader concept or territory.
            </p>
          )}
          {results.map((c, i) => {
            const meta = CONTINENT_META[c.continent as keyof typeof CONTINENT_META];
            return (
              <button
                id={`search-result-${c.id}`}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                key={c.id}
                onMouseDown={() => handleSelect(c.id)}
                className="w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors"
                style={{
                  background: i === highlighted ? 'rgba(200,169,110,0.08)' : 'transparent',
                  borderBottom: '1px solid rgba(200,169,110,0.05)',
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                <span
                  className="text-sm"
                  style={{ color: '#f0e6c8', fontFamily: '"Cinzel", serif', letterSpacing: '0.01em' }}
                >
                  {c.name}
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: meta.label + '99' }}
                >
                  {c.region} · {meta.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
