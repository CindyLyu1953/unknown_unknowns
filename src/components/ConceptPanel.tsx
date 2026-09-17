import { useEffect, useRef } from 'react';
import type { Concept } from '../data/concepts';
import { conceptMap, getConceptDescription, CONTINENT_META } from '../data/concepts';

interface Props {
  concept: Concept;
  onClose: () => void;
}

const sectionConfig = [
  { key: 'question', label: 'The Question', icon: '◈' },
  { key: 'fascination', label: 'Why It Fascinates', icon: '✦' },
  { key: 'world', label: 'The World It Opens', icon: '◉' },
  { key: 'entrance', label: 'Easiest Entrance', icon: '◫' },
  { key: 'relevance', label: 'Why You Should Care', icon: '◆' },
] as const;

export default function ConceptPanel({ concept, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const desc = getConceptDescription(concept);
  const meta = CONTINENT_META[concept.continent as keyof typeof CONTINENT_META];

  const prereqs = concept.prerequisites
    .map(id => conceptMap.get(id))
    .filter(Boolean) as Concept[];
  const parents = concept.parents.map(id => conceptMap.get(id)).filter(Boolean) as Concept[];
  const children = concept.children.map(id => conceptMap.get(id)).filter(Boolean) as Concept[];
  const unlocks = concept.unlocks.map(id => conceptMap.get(id)).filter(Boolean) as Concept[];

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [concept.id, onClose]);

  const importanceLabel = concept.importance === 1 ? 'Landmark' : concept.importance === 2 ? 'Settlement' : 'Waypoint';

  return (
    <div
      className="concept-panel absolute top-0 right-0 h-full w-[400px] z-30 flex flex-col"
      style={{ background: 'rgba(8,14,24,0.97)', borderLeft: '1px solid rgba(200,169,110,0.15)' }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="concept-panel-title"
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid rgba(200,169,110,0.1)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono tracking-widest" style={{ color: meta.label }}>
                {meta.name.toUpperCase()}
              </span>
            </div>
            <h2
              id="concept-panel-title"
              className="text-xl leading-tight font-display"
              style={{ color: '#f0e6c8', letterSpacing: '0.02em' }}
            >
              {concept.name}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="text-xs px-2 py-0.5 rounded-sm font-mono"
                style={{ background: 'rgba(200,169,110,0.1)', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.2)' }}
              >
                {concept.region}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-sm font-mono"
                style={{ background: 'rgba(200,169,110,0.06)', color: 'rgba(200,169,110,0.6)', border: '1px solid rgba(200,169,110,0.12)' }}
              >
                {importanceLabel}
              </span>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close concept details"
            onClick={onClose}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-sm transition-colors"
            style={{ color: 'rgba(200,169,110,0.5)', border: '1px solid rgba(200,169,110,0.15)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c8a96e')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,169,110,0.5)')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5" style={{ fontFamily: '"Crimson Pro", serif' }}>
        {sectionConfig.map(({ key, label, icon }) => (
          <div key={key}>
            <div className="flex items-center gap-2 mb-1.5">
              <span style={{ color: meta.label, fontSize: 10 }}>{icon}</span>
              <span
                className="text-xs tracking-widest uppercase font-mono"
                style={{ color: 'rgba(200,169,110,0.5)' }}
              >
                {label}
              </span>
            </div>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'rgba(240,230,200,0.85)' }}
            >
              {desc[key]}
            </p>
          </div>
        ))}

        {/* Prerequisites */}
        {prereqs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: 'rgba(200,169,110,0.5)', fontSize: 10 }}>◁</span>
              <span
                className="text-xs tracking-widest uppercase font-mono"
                style={{ color: 'rgba(200,169,110,0.5)' }}
              >
                Required Roads
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prereqs.map(p => {
                const pm = CONTINENT_META[p.continent as keyof typeof CONTINENT_META];
                return (
                  <span
                    key={p.id}
                    className="text-xs px-2 py-0.5 rounded-sm font-body"
                    style={{
                      background: 'rgba(200,169,110,0.06)',
                      color: pm.label,
                      border: `1px solid ${pm.label}30`,
                      fontFamily: '"Crimson Pro", serif',
                    }}
                  >
                    {p.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {(parents.length > 0 || children.length > 0 || unlocks.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(200,169,110,0.5)', fontSize: 10 }}>▧</span>
              <span className="text-xs tracking-widest uppercase font-mono" style={{ color: 'rgba(200,169,110,0.5)' }}>
                Map relationships
              </span>
            </div>
            {[
              { label: 'Inside', values: parents },
              { label: 'Contains', values: children },
              { label: 'Unlocks', values: unlocks },
            ].filter(group => group.values.length > 0).map(group => (
              <div key={group.label}>
                <span className="text-xs font-mono" style={{ color: 'rgba(200,169,110,0.42)' }}>{group.label}</span>
                <p className="mt-0.5 text-sm" style={{ color: 'rgba(240,230,200,0.78)' }}>
                  {group.values.slice(0, 6).map(item => item.name).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 px-6 py-3"
        style={{ borderTop: '1px solid rgba(200,169,110,0.08)' }}
      >
        <p
          className="text-xs text-center font-mono"
          style={{ color: 'rgba(200,169,110,0.3)' }}
        >
          DOUBLE-CLICK TO FOCUS · SINGLE-CLICK TO SELECT
        </p>
      </div>
    </div>
  );
}
