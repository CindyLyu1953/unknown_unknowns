import { useEffect, useMemo, useRef, useState } from 'react';
import type { Concept } from '../data/concepts';
import { conceptMap, CONTINENT_META } from '../data/concepts';
import type { KnowledgeRoute } from '../navigation/route-engine';
import { routeStepLabels } from '../navigation/route-engine';

interface ConceptInputProps {
  label: string;
  marker: string;
  valueId: string | null;
  concepts: Concept[];
  onChange: (id: string) => void;
}

function ConceptInput({ label, marker, valueId, concepts, onChange }: ConceptInputProps) {
  const selected = valueId ? conceptMap.get(valueId) : null;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQuery(selected?.name ?? ''), [selected?.name]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return concepts.slice(0, 8);
    const matchRank = (concept: Concept) => {
      const name = concept.name.toLowerCase();
      const region = concept.region.toLowerCase();
      if (name === normalized) return 0;
      if (name.startsWith(normalized)) return 1;
      if (name.includes(normalized)) return 2;
      if (region.startsWith(normalized)) return 3;
      return 4;
    };
    return concepts
      .filter(concept => concept.name.toLowerCase().includes(normalized) || concept.region.toLowerCase().includes(normalized))
      .sort((a, b) => matchRank(a) - matchRank(b) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [concepts, query]);

  const choose = (concept: Concept) => {
    onChange(concept.id);
    setQuery(concept.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <label className="block text-[11px] font-mono tracking-[0.16em] uppercase mb-1.5" style={{ color: 'rgba(225,205,157,0.55)' }}>
        {label}
      </label>
      <div className="flex items-center gap-3 h-11 px-3 rounded-md" style={{ background: 'rgba(5,12,20,0.82)', border: '1px solid rgba(214,184,119,0.2)' }}>
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono flex-none" style={{ color: '#07111d', background: marker }} aria-hidden="true">{label === 'Start' ? 'A' : 'B'}</span>
        <input
          ref={inputRef}
          value={query}
          onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, results.length - 1)); }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); }
            if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); }
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder={`Choose ${label.toLowerCase()} concept`}
          aria-label={`${label} concept`}
          aria-expanded={open}
          role="combobox"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          style={{ color: '#f4ead2', fontFamily: '"Crimson Pro", serif' }}
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md overflow-hidden shadow-2xl" role="listbox" style={{ background: '#08131f', border: '1px solid rgba(214,184,119,0.24)' }}>
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm" style={{ color: 'rgba(244,234,210,0.58)' }}>No matching concept</p>
          ) : results.map((concept, index) => (
            <button
              key={concept.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={() => choose(concept)}
              onMouseEnter={() => setActiveIndex(index)}
              className="w-full px-3 py-2 text-left transition-colors"
              style={{ background: index === activeIndex ? 'rgba(214,184,119,0.1)' : 'transparent', borderBottom: '1px solid rgba(214,184,119,0.06)' }}
            >
              <span className="block text-sm" style={{ color: '#f4ead2' }}>{concept.name}</span>
              <span className="block text-[11px] mt-0.5 font-mono" style={{ color: `${CONTINENT_META[concept.continent].label}bb` }}>{concept.region}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  concepts: Concept[];
  selectedId: string | null;
  startId: string | null;
  endId: string | null;
  route: KnowledgeRoute | null;
  onSetStart: (id: string) => void;
  onSetEnd: (id: string) => void;
  onFocus: (id: string) => void;
  onSwap: () => void;
  onClear: () => void;
  onClose: () => void;
}

export default function RoutePlanner({ concepts, selectedId, startId, endId, route, onSetStart, onSetEnd, onFocus, onSwap, onClear, onClose }: Props) {
  const selected = selectedId ? conceptMap.get(selectedId) : null;
  return (
    <aside className="absolute top-[82px] left-5 z-30 w-[380px] max-h-[calc(100%-110px)] rounded-xl overflow-hidden flex flex-col shadow-2xl" style={{ background: 'rgba(7,15,25,0.96)', border: '1px solid rgba(214,184,119,0.22)', backdropFilter: 'blur(18px)' }} aria-label="Knowledge directions">
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(214,184,119,0.1)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-mono tracking-[0.18em]" style={{ color: '#d8b96f' }}>KNOWLEDGE DIRECTIONS</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(244,234,210,0.68)', fontFamily: '"Crimson Pro", serif' }}>Find a path between two ideas.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close directions" className="w-11 h-11 rounded-md flex items-center justify-center" style={{ color: '#dbc584', border: '1px solid rgba(214,184,119,0.2)' }}>×</button>
        </div>
        <div className="space-y-3">
          <ConceptInput label="Start" marker="#79cda5" valueId={startId} concepts={concepts} onChange={onSetStart} />
          <ConceptInput label="Destination" marker="#e6bd67" valueId={endId} concepts={concepts} onChange={onSetEnd} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button type="button" onClick={onSwap} disabled={!startId && !endId} className="h-10 rounded-md text-xs font-mono disabled:opacity-40" style={{ color: '#dfcf9f', border: '1px solid rgba(214,184,119,0.18)' }}>SWAP</button>
          <button type="button" onClick={onClear} disabled={!startId && !endId} className="h-10 rounded-md text-xs font-mono disabled:opacity-40" style={{ color: '#dfcf9f', border: '1px solid rgba(214,184,119,0.18)' }}>CLEAR</button>
        </div>
        {selected && (
          <div className="mt-3 p-3 rounded-md" style={{ background: 'rgba(214,184,119,0.06)', border: '1px solid rgba(214,184,119,0.12)' }}>
            <p className="text-sm truncate" style={{ color: '#f4ead2' }}>Selected: {selected.name}</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button type="button" onClick={() => onSetStart(selected.id)} className="h-9 rounded text-xs" style={{ color: '#a9e7c7', border: '1px solid rgba(121,205,165,0.3)' }}>Set as start</button>
              <button type="button" onClick={() => onSetEnd(selected.id)} className="h-9 rounded text-xs" style={{ color: '#f0d084', border: '1px solid rgba(230,189,103,0.3)' }}>Set as destination</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {!startId || !endId ? (
          <div className="py-5 text-center">
            <p className="text-lg" style={{ color: '#f1e4c4', fontFamily: '"Crimson Pro", serif' }}>Choose two places</p>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'rgba(244,234,210,0.5)' }}>Search above, or click a place on the map and use the selected-place buttons.</p>
          </div>
        ) : !route ? (
          <div role="alert" className="p-3 rounded-md text-sm" style={{ color: '#f1c9a4', background: 'rgba(126,55,34,0.25)' }}>No connected knowledge route is available yet.</div>
        ) : (
          <>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-2xl" style={{ color: '#f4ead2', fontFamily: '"Crimson Pro", serif' }}>{route.conceptIds.length} places</p>
                <p className="text-[11px] mt-1 font-mono" style={{ color: 'rgba(244,234,210,0.42)' }}>{route.steps.length} LEARNING MOVES</p>
              </div>
              <span className="text-[11px] font-mono px-2 py-1 rounded" style={{ color: '#d8b96f', background: 'rgba(214,184,119,0.08)' }}>BEST ROUTE</span>
            </div>
            <ol className="space-y-0">
              {route.conceptIds.map((id, index) => {
                const concept = conceptMap.get(id);
                const step = index > 0 ? route.steps[index - 1] : null;
                if (!concept) return null;
                return (
                  <li key={id} className="relative flex gap-3 min-h-[64px]">
                    <div className="flex flex-col items-center">
                      <button type="button" onClick={() => onFocus(id)} aria-label={`Focus ${concept.name}`} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono z-10" style={{ color: '#09131f', background: index === 0 ? '#79cda5' : index === route.conceptIds.length - 1 ? '#e6bd67' : '#d9c997' }}>{index + 1}</button>
                      {index < route.conceptIds.length - 1 && <span className="w-px flex-1 min-h-8" style={{ background: 'linear-gradient(#d9c997, rgba(217,201,151,0.22))' }} />}
                    </div>
                    <button type="button" onClick={() => onFocus(id)} className="text-left flex-1 pb-4 min-w-0">
                      <span className="block text-base leading-tight" style={{ color: '#f4ead2', fontFamily: '"Crimson Pro", serif' }}>{concept.name}</span>
                      {step && (
                        <>
                          <span className="block text-[11px] mt-1 font-mono" style={{ color: `${CONTINENT_META[concept.continent].label}cc` }}>{routeStepLabels[step.kind]} · {concept.region}</span>
                          <span className="block text-xs mt-1 leading-snug" style={{ color: 'rgba(244,234,210,0.52)', fontFamily: '"Crimson Pro", serif' }}>{step.instruction}</span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </aside>
  );
}
