import { useCallback, useEffect, useMemo, useState } from 'react';
import ConceptClusterGraph from './components/ConceptClusterGraph';
import { concepts, conceptMap, getConceptDescription, relationCount } from './data/concepts';
import type { Concept } from './data/concepts';
import { findKnowledgeRoute, routeStepLabels } from './navigation/route-engine';

const SearchIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const RouteIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8"/><circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.8"/><path d="M8.5 18h2.8c4 0 2.5-8.5 6.4-9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;

function rankResults(query: string, pool = concepts) {
  const value = query.trim().toLowerCase();
  if (!value) return [];
  const rank = (concept: Concept) => {
    const name = concept.name.toLowerCase();
    if (name === value) return 0;
    if (name.startsWith(value)) return 1;
    if (name.includes(value)) return 2;
    return 3;
  };
  return pool.filter(concept => concept.name.toLowerCase().includes(value) || concept.region.toLowerCase().includes(value)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 8);
}

function Search({ onSelect }: { onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => rankResults(query), [query]);
  const choose = (concept: Concept) => { onSelect(concept.id); setQuery(''); setOpen(false); };
  return <div className="minimal-search">
    <SearchIcon />
    <input aria-label="Search all concepts" role="combobox" aria-expanded={open} value={query} placeholder="Search concepts and regions" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 130)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(value + 1, results.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && results[active]) choose(results[active]);
      if (event.key === 'Escape') setOpen(false);
    }} />
    <span className="minimal-key">/</span>
    {open && query && <div className="minimal-search-results" role="listbox">
      {results.length ? results.map((concept, index) => <button key={concept.id} type="button" role="option" aria-selected={active === index} className={active === index ? 'active' : ''} onMouseDown={() => choose(concept)} onMouseEnter={() => setActive(index)}>
        <span>{concept.name}</span><small>{concept.region}</small>
      </button>) : <p>No matches. Try a broader term.</p>}
    </div>}
  </div>;
}

function Picker({ label, valueId, onChange }: { label: string; valueId: string | null; onChange: (id: string) => void }) {
  const selected = valueId ? conceptMap.get(valueId) : null;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => rankResults(query), [query]);
  useEffect(() => setQuery(selected?.name ?? ''), [selected?.name]);
  return <div className="minimal-picker">
    <label>{label}</label>
    <div><span className={label === 'Start' ? 'start' : 'end'}>{label === 'Start' ? 'A' : 'B'}</span><input role="combobox" aria-expanded={open} aria-label={`${label} concept`} value={query} placeholder={`Choose ${label.toLowerCase()}`} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 130)} onChange={event => { setQuery(event.target.value); setOpen(true); }} /></div>
    {open && query && <div className="minimal-picker-results" role="listbox">{results.map(concept => <button type="button" role="option" aria-selected={concept.id === valueId} key={concept.id} onMouseDown={() => { onChange(concept.id); setQuery(concept.name); setOpen(false); }}><span>{concept.name}</span><small>{concept.region}</small></button>)}</div>}
  </div>;
}

function Directions({ selectedId, startId, endId, onStart, onEnd, onFocus, onSwap, onClear, onClose }: { selectedId: string | null; startId: string | null; endId: string | null; onStart: (id: string) => void; onEnd: (id: string) => void; onFocus: (id: string) => void; onSwap: () => void; onClear: () => void; onClose: () => void }) {
  const selected = selectedId ? conceptMap.get(selectedId) : null;
  const route = useMemo(() => findKnowledgeRoute(startId, endId), [startId, endId]);
  return <aside className="minimal-directions" aria-label="Knowledge directions">
    <div className="minimal-panel-head"><div><h2>Directions</h2><p>Find the clearest path between two ideas.</p></div><button type="button" aria-label="Close directions" onClick={onClose}>×</button></div>
    <div className="minimal-route-form">
      <Picker label="Start" valueId={startId} onChange={onStart} />
      <Picker label="Destination" valueId={endId} onChange={onEnd} />
      <div className="minimal-route-actions"><button type="button" onClick={onSwap} disabled={!startId && !endId}>Swap</button><button type="button" onClick={onClear} disabled={!startId && !endId}>Clear</button></div>
      {selected && <div className="minimal-selected"><strong>{selected.name}</strong><div><button type="button" onClick={() => onStart(selected.id)}>Set as start</button><button type="button" onClick={() => onEnd(selected.id)}>Set as destination</button></div></div>}
    </div>
    <div className="minimal-route-body" aria-live="polite">
      {!startId || !endId ? <div className="minimal-empty"><RouteIcon/><h3>Choose two concepts</h3><p>Search above, or select a place on the map and assign it as your start or destination.</p></div> : !route ? <div className="minimal-empty"><h3>No route yet</h3><p>These concepts are not connected in the current graph.</p></div> : <>
        <div className="minimal-route-summary"><div><strong>{route.conceptIds.length} places</strong><span>{route.steps.length} learning moves</span></div><span>Best route</span></div>
        <ol className="minimal-steps">{route.conceptIds.map((id, index) => {
          const concept = conceptMap.get(id); const step = index ? route.steps[index - 1] : null; if (!concept) return null;
          return <li key={id}><div className={`minimal-step-dot ${index === 0 ? 'start' : index === route.conceptIds.length - 1 ? 'end' : ''}`}>{index + 1}</div><button type="button" onClick={() => onFocus(id)}><strong>{concept.name}</strong>{step && <><span>{routeStepLabels[step.kind]} · {concept.region}</span><small>{step.instruction}</small></>}</button></li>;
        })}</ol>
      </>}
    </div>
  </aside>;
}

function Details({ concept, onClose }: { concept: Concept; onClose: () => void }) {
  const description = getConceptDescription(concept);
  const sections = [
    ['The question', description.question], ['Why it fascinates', description.fascination], ['The world it opens', description.world], ['Easiest entrance', description.entrance], ['Why you might care', description.relevance],
  ];
  return <aside className="minimal-details" aria-labelledby="minimal-details-title">
    <div className="minimal-panel-head"><div><span>{concept.region}</span><h2 id="minimal-details-title">{concept.name}</h2></div><button type="button" aria-label="Close concept details" onClick={onClose}>×</button></div>
    <div className="minimal-detail-scroll">
      {sections.map(([title, copy]) => <section key={title}><h3>{title}</h3><p>{copy}</p></section>)}
      {concept.prerequisites.length > 0 && <section><h3>Prerequisites</h3><div className="minimal-tags">{concept.prerequisites.map(id => conceptMap.get(id)).filter(Boolean).map(item => <span key={item!.id}>{item!.name}</span>)}</div></section>}
      {concept.unlocks.length > 0 && <section><h3>Unlocks</h3><div className="minimal-tags">{concept.unlocks.slice(0, 8).map(id => conceptMap.get(id)).filter(Boolean).map(item => <span key={item!.id}>{item!.name}</span>)}</div></section>}
    </div>
  </aside>;
}

export default function MinimalApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openConcept, setOpenConcept] = useState<Concept | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [startId, setStartId] = useState<string | null>(null);
  const [endId, setEndId] = useState<string | null>(null);
  const route = useMemo(() => findKnowledgeRoute(startId, endId), [startId, endId]);
  const focus = useCallback((id: string) => { setSelectedId(id); setFocusId(id); }, []);
  const open = useCallback((id: string) => { const concept = conceptMap.get(id); if (concept) setOpenConcept(concept); setSelectedId(id); }, []);

  return <div className="minimal-app">
    <ConceptClusterGraph selectedId={selectedId} onSelect={id => { setSelectedId(id); if (!id) setOpenConcept(null); }} onOpen={open} focusId={focusId} onFocused={() => setFocusId(null)} route={route} leftInset={directionsOpen ? 390 : 0} />
    <header className="minimal-header">
      <div className="minimal-brand"><div className="minimal-logo">DS</div><div><h1>Data Science Universe</h1><span>{concepts.length} concepts · {relationCount} relations</span></div></div>
      <Search onSelect={focus} />
      <div className="minimal-header-actions"><button type="button" className={directionsOpen ? 'primary active' : 'primary'} aria-pressed={directionsOpen} onClick={() => setDirectionsOpen(value => !value)}><RouteIcon/>Directions</button></div>
    </header>
    {directionsOpen && <Directions selectedId={selectedId} startId={startId} endId={endId} onStart={id => { setStartId(id); setOpenConcept(null); }} onEnd={id => { setEndId(id); setOpenConcept(null); }} onFocus={focus} onSwap={() => { setStartId(endId); setEndId(startId); }} onClear={() => { setStartId(null); setEndId(null); }} onClose={() => setDirectionsOpen(false)} />}
    {openConcept && <Details concept={openConcept} onClose={() => setOpenConcept(null)} />}
    {!directionsOpen && !openConcept && <div className="minimal-help">Drag to explore <span>·</span> Scroll to zoom <span>·</span> Double-click a concept to learn more</div>}
  </div>;
}
