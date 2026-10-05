import { useState } from 'react';
import { Download,Copy,ExternalLink } from 'lucide-react';
import { download } from '../lib/data';
import { citation,softwareCitation,softwareBibtex,softwareRis,coordinateMethods,type CitationRow } from '../lib/citation';
import type { Point } from '../lib/types';

export default function CitationPanel({point,rows,selected,busy}:{point:Point;rows:CitationRow[];selected:number[];busy:boolean}){
  const [message,setMessage]=useState('');
  const methods=coordinateMethods(point,rows,selected);
  const references=[...new Set(rows.map(r=>r.atlas.citation))];
  const report=[methods,'References',softwareCitation,...references].join('\n\n');
  const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);setMessage('Copied to clipboard.');}catch{setMessage('Clipboard is unavailable. Select the text or download the file.');}};
  return <div className="citation-panel">
    <h3>Cite BrainRosetta</h3>
    <p className="method-note">{softwareCitation}</p>
    <a className="source-link" href={`https://doi.org/${citation.doi}`} target="_blank" rel="noreferrer">Archived release v{citation.version}<ExternalLink size={14}/></a>
    <p>The DOI identifies the archived release. Methods exports also record the build commit of the app you are using.</p>
    <button className="wide-button" onClick={()=>void copy(softwareCitation)}><Copy size={17}/>Copy software citation</button>
    <div className="citation-downloads"><button className="secondary-button" onClick={()=>download('BrainRosetta.bib',softwareBibtex,'application/x-bibtex')}>Download BibTeX</button><button className="secondary-button" onClick={()=>download('BrainRosetta.ris',softwareRis,'application/x-research-info-systems')}>Download RIS</button></div>
    {message&&<p role="status">{message}</p>}
    <h4>Original atlas citations</h4><p>Cite the original atlases used in your analysis alongside BrainRosetta. These references cover the active atlas and pinned comparisons.</p>
    {references.map(reference=><p className="method-note" key={reference}>{reference}</p>)}
    <h4>Methods for this coordinate</h4>
    <p>This draft describes the current lookup and checked labels. Review it for your paper. For a saved ROI mask, download its Methods text after export.</p>
    {busy?<p role="status">Waiting for coordinate lookups to finish…</p>:<textarea className="citation-methods" aria-label="Coordinate Methods text" readOnly value={methods}/>}
    <button className="wide-button" disabled={busy} onClick={()=>void copy(report)}><Copy size={17}/>Copy Methods & references</button>
    <button className="wide-button" disabled={busy} onClick={()=>download('BrainRosetta-methods.txt',report)}><Download size={17}/>Download Methods & references</button>
  </div>;
}
