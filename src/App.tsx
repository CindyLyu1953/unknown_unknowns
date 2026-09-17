import { useState, useCallback, useMemo } from 'react';
import WorldMap from './components/WorldMap';
import ConceptPanel from './components/ConceptPanel';
import SearchBar from './components/SearchBar';
import RoutePlanner from './components/RoutePlanner';
import { concepts, conceptMap, relationCount } from './data/concepts';
import type { Concept } from './data/concepts';
import { findKnowledgeRoute } from './navigation/route-engine';
import MinimalApp from './MinimalApp';

function AtlasApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openConcept, setOpenConcept] = useState<Concept | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [routeStartId, setRouteStartId] = useState<string | null>(null);
  const [routeEndId, setRouteEndId] = useState<string | null>(null);
  const route = useMemo(() => findKnowledgeRoute(routeStartId, routeEndId), [routeStartId, routeEndId]);

  const handleSearchSelect = useCallback((id: string) => {
    setFocusId(id);
    setSelectedId(id);
  }, []);

  const handleOpen = useCallback((id: string) => {
    const c = conceptMap.get(id);
    if (c) setOpenConcept(c);
    setSelectedId(id);
  }, []);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) setOpenConcept(null);
  }, []);

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: '#06090f', fontFamily: '"Cinzel", serif' }}
    >
      {/* Full-screen map */}
      <WorldMap
        selectedId={selectedId}
        onSelect={handleSelect}
        onOpen={handleOpen}
        focusId={focusId}
        onFocused={() => setFocusId(null)}
        route={route}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-5 pt-4 pointer-events-none z-20">
        {/* Title block */}
        <div className="pointer-events-none select-none">
          <h1
            className="text-xl tracking-widest"
            style={{ color: 'rgba(240,230,200,0.9)', letterSpacing: '0.12em', textShadow: '0 0 20px rgba(200,169,110,0.3)' }}
          >
            DATA SCIENCE UNIVERSE
          </h1>
          <p
            className="text-xs mt-0.5 font-mono tracking-widest"
            style={{ color: 'rgba(200,169,110,0.35)', letterSpacing: '0.15em' }}
          >
            {concepts.length} CONCEPTS · {relationCount} RELATIONS · INFINITE CURIOSITY
          </p>
        </div>

        {/* Controls row */}
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            aria-label="Open knowledge directions"
            aria-pressed={directionsOpen}
            onClick={() => setDirectionsOpen(open => !open)}
            className="h-11 px-3 rounded-md flex items-center gap-2 text-xs font-mono tracking-wider transition-colors"
            style={{
              color: directionsOpen ? '#07111d' : '#e8d59d',
              background: directionsOpen ? '#d8b96f' : 'rgba(8,14,24,0.92)',
              border: '1px solid rgba(200,169,110,0.28)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8.5 18h3.2c3.8 0 2.2-8 6.3-9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            DIRECTIONS
          </button>
          <SearchBar concepts={concepts} onSelect={handleSearchSelect} />
        </div>
      </div>

      {directionsOpen && (
        <RoutePlanner
          concepts={concepts}
          selectedId={selectedId}
          startId={routeStartId}
          endId={routeEndId}
          route={route}
          onSetStart={id => { setRouteStartId(id); setOpenConcept(null); }}
          onSetEnd={id => { setRouteEndId(id); setOpenConcept(null); }}
          onFocus={id => { setSelectedId(id); setFocusId(id); }}
          onSwap={() => { setRouteStartId(routeEndId); setRouteEndId(routeStartId); }}
          onClear={() => { setRouteStartId(null); setRouteEndId(null); }}
          onClose={() => setDirectionsOpen(false)}
        />
      )}

      {/* Legend */}
      {!directionsOpen && <div
        className="absolute bottom-10 left-5 z-20 pointer-events-none select-none"
        style={{
          background: 'rgba(6,9,15,0.82)',
          border: '1px solid rgba(200,169,110,0.1)',
          borderRadius: 2,
          padding: '10px 12px',
        }}
      >
        <p className="text-xs font-mono tracking-widest mb-2" style={{ color: 'rgba(200,169,110,0.4)' }}>LEGEND</p>
        <div className="flex flex-col gap-1.5">
          {[
            { sym: '✦', color: '#7ecba0', label: 'Foundations landmark' },
            { sym: '✦', color: '#7eb8d4', label: 'Computation landmark' },
            { sym: '✦', color: '#b07ed4', label: 'Modeling landmark' },
            { sym: '✦', color: '#d4a74a', label: 'Decisions landmark' },
          ].map(({ sym, color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span style={{ color, fontSize: 9 }}>{sym}</span>
              <span className="text-xs font-mono" style={{ color: 'rgba(240,230,200,0.45)' }}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <svg width="16" height="6" viewBox="0 0 16 6">
              <path d="M0 3 Q8 0 16 3" stroke="rgba(200,169,110,0.5)" strokeWidth="1" strokeDasharray="2,2" fill="none"/>
              <polygon points="14,1 16,3 14,5" fill="rgba(200,169,110,0.5)"/>
            </svg>
            <span className="text-xs font-mono" style={{ color: 'rgba(240,230,200,0.45)' }}>prerequisite route</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'rgba(200,169,110,0.6)', fontSize: 10 }}>▧</span>
            <span className="text-xs font-mono" style={{ color: 'rgba(240,230,200,0.45)' }}>part-of territory</span>
          </div>
        </div>
      </div>}

      {/* Usage hint (fades when concept is selected) */}
      {!selectedId && !directionsOpen && (
        <div
          className="absolute bottom-10 left-1/2 z-20 pointer-events-none select-none"
          style={{ transform: 'translateX(-50%)', textAlign: 'center' }}
        >
          <p className="text-xs font-mono tracking-widest" style={{ color: 'rgba(200,169,110,0.3)' }}>
            SCROLL TO ZOOM · DRAG TO EXPLORE · CLICK TO SELECT · DOUBLE-CLICK TO STUDY
          </p>
        </div>
      )}

      {/* Concept panel */}
      {openConcept && (
        <ConceptPanel concept={openConcept} onClose={() => setOpenConcept(null)} />
      )}
    </div>
  );
}

export default function App() {
  const variant = new URLSearchParams(window.location.search).get('variant');
  return variant === 'minimal' ? <MinimalApp /> : <AtlasApp />;
}
