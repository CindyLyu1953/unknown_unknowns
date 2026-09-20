import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import pairData from '../data/concept-pairs-expanded.json';

type Evidence = {
  title: string;
  url: string;
  kind: string;
  observation: string;
};

type PairRecord = {
  pair_id: string;
  source_concept_id: string;
  target_concept_id: string;
  source_concept: string;
  target_concept: string;
  relationship: 'prerequisite_of' | 'part_of';
  confidence: number;
  status: string;
  evidence: Evidence[];
};

const records = pairData.concept_pairs as PairRecord[];
const PAGE_SIZE = 50;

const relationshipLabel = {
  prerequisite_of: 'prerequisite of',
  part_of: 'part of',
};

type EvidenceBasisKey = 'derived' | 'two_taxonomies' | 'explicit_prerequisite' | 'course_evidence' | 'textbook_sequence' | 'taxonomy_supported' | 'human_reviewed';

const evidenceBasisOptions: { key: EvidenceBasisKey; label: string }[] = [
  { key: 'derived', label: 'Curriculum / taxonomy derived' },
  { key: 'two_taxonomies', label: 'Supported by 2 taxonomies' },
  { key: 'explicit_prerequisite', label: 'Explicit university prerequisite' },
  { key: 'course_evidence', label: 'Course prerequisite evidence' },
  { key: 'textbook_sequence', label: 'Textbook sequence evidence' },
  { key: 'taxonomy_supported', label: 'Taxonomy-supported' },
  { key: 'human_reviewed', label: 'Human-reviewed seed' },
];

function evidenceBasis(record: PairRecord) {
  const kinds = new Set(record.evidence.map(item => item.kind));
  if (record.status === 'taxonomy_candidate') return evidenceBasisOptions[0];
  if (record.relationship === 'part_of' && record.evidence.filter(item => item.kind === 'taxonomy').length >= 2) return evidenceBasisOptions[1];
  if (kinds.has('explicit_concept_prerequisite')) return evidenceBasisOptions[2];
  if (kinds.has('course_prerequisite_projection')) return evidenceBasisOptions[3];
  if (kinds.has('textbook_precedence')) return evidenceBasisOptions[4];
  if (kinds.has('taxonomy')) return evidenceBasisOptions[5];
  return evidenceBasisOptions[6];
}

const availableEvidenceOptions = evidenceBasisOptions.filter(option => records.some(record => evidenceBasis(record).key === option.key));

function SourceList({ evidence }: { evidence: Evidence[] }) {
  return <div className="database-sources">
    {evidence.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" title={source.observation}>
      <strong>{source.title}</strong>
      <span>{source.kind.replace(/_/g, ' ')}</span>
    </a>)}
  </div>;
}

export default function ConceptDatabase({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [relationship, setRelationship] = useState<'all' | PairRecord['relationship']>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<'all' | EvidenceBasisKey>('all');
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(() => records.filter(record => {
    if (relationship !== 'all' && record.relationship !== relationship) return false;
    const basis = evidenceBasis(record);
    if (evidenceFilter !== 'all' && basis.key !== evidenceFilter) return false;
    if (!deferredQuery) return true;
    return `${record.source_concept} ${record.target_concept} ${basis.label} ${record.evidence.map(source => source.title).join(' ')}`.toLowerCase().includes(deferredQuery);
  }), [deferredQuery, evidenceFilter, relationship]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [deferredQuery, evidenceFilter, relationship]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return <main className="database-page">
    <div className="database-heading">
      <div><span>RELATIONSHIP DATABASE</span><h2>Concept pairs</h2></div>
      <div className="database-stats"><strong>{records.length}</strong><span>total pairs</span><strong>{pairData.metadata.validated_pair_count}</strong><span>human validated</span></div>
    </div>
    <div className="database-toolbar">
      <label className="database-search"><span>Search relationships or sources</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search concepts or a source…" /></label>
      <label className="database-filter"><span>Relationship</span><select value={relationship} onChange={event => setRelationship(event.target.value as typeof relationship)}><option value="all">All relationships</option><option value="prerequisite_of">Prerequisite</option><option value="part_of">Part of</option></select></label>
      <label className="database-filter"><span>Evidence</span><select value={evidenceFilter} onChange={event => setEvidenceFilter(event.target.value as typeof evidenceFilter)}><option value="all">All evidence types</option>{availableEvidenceOptions.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>
      <div className="database-result-count" aria-live="polite">{filtered.length} pairs</div>
    </div>
    <div className="database-table-wrap">
      <table className="database-table">
        <thead><tr><th scope="col">Concept A</th><th scope="col">Relationship</th><th scope="col">Concept B</th><th scope="col">Sources</th><th scope="col">Evidence basis</th></tr></thead>
        <tbody>{visible.map(record => { const basis = evidenceBasis(record); return <tr key={record.pair_id}>
          <td><button type="button" className="database-concept" onClick={() => onOpenConcept(record.source_concept_id)}>{record.source_concept}</button></td>
          <td><span className={`database-relation ${record.relationship}`}>{relationshipLabel[record.relationship]}</span></td>
          <td><button type="button" className="database-concept" onClick={() => onOpenConcept(record.target_concept_id)}>{record.target_concept}</button></td>
          <td><SourceList evidence={record.evidence} /></td>
          <td><span className={`database-basis ${basis.key}`}>{basis.label}</span></td>
        </tr>; })}</tbody>
      </table>
      {!visible.length && <div className="database-no-results"><strong>No matching relationships</strong><span>Try a broader concept or source name.</span></div>}
    </div>
    <div className="database-pagination">
      <span>Showing {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
      <div><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page === pageCount}>Next</button></div>
    </div>
  </main>;
}
