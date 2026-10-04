"""Download provenance-tracked registration and independent landmark sources."""
from pathlib import Path
import hashlib,json,subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.cache/transforms';WORK.mkdir(parents=True,exist_ok=True)
TF='https://templateflow.s3.amazonaws.com/'
RAW='https://raw.githubusercontent.com/'
COMMITS={'MNI152NLin6Asym':'c906e8d808a34719e5024a4bde61f03a4e411ddd','MNI152NLin2009cAsym':'15d7c02160f79f5218d2545b4febebeecc11531d'}
AFIDS={'MNIColin27':'0665fbc5bd30c96a4810d9af1974a25b454bbcf2','MNI152NLin2009cAsym':'a44e5a7f5227a6219416ef842f149c05961133ab','MNI152NLin6Asym':'3fe7da44a7ce069a08ec4066723ef7e6b816583c'}
jobs=[]
for name,short,other,other_short in [('MNI152NLin6Asym','6','MNI152NLin2009cAsym','2009'),('MNI152NLin2009cAsym','2009','MNI152NLin6Asym','6')]:
 jobs.append((f'tf-{other_short}-to-{short}-image.h5',TF+f'tpl-{name}/tpl-{name}_from-{other}_mode-image_xfm.h5'))
 for suffix,file in [('T1w','brain.nii.gz'),('mask','mask.nii.gz')]:
  jobs.append((f'{short}-{file}',TF+f'tpl-{name}/tpl-{name}_res-01_desc-brain_{suffix}.nii.gz'))
 if short=='2009':jobs.append((f'{short}-LICENSE.txt',RAW+f'templateflow/tpl-{name}/{COMMITS[name]}/LICENSE'))
 jobs.append((f'{short}-template-description.json',RAW+f'templateflow/tpl-{name}/{COMMITS[name]}/template_description.json'))
for name,commit in AFIDS.items():
 stem=f'tpl-{name}'+('' if name=='MNIColin27' else '_res-01')+'_desc-groundtruth_afids.fcsv'
 jobs.append((f'{name}-afids.fcsv',RAW+f'afids/tpl-{name}/{commit}/{stem}'))
 jobs.append((f'{name}-AFIDS-LICENSE.txt',RAW+f'afids/tpl-{name}/{commit}/LICENSE'))
def fetch(job):
 filename,url=job;p=WORK/filename
 if not p.exists():
  tmp=WORK/(filename+'.part');subprocess.run(['curl','-fLsS','--retry','2','--max-time','240',url,'-o',str(tmp)],check=True);tmp.replace(p)
 return dict(file=filename,url=url,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=4) as pool:receipts=list(pool.map(fetch,jobs))
 (WORK/'sources.json').write_text(json.dumps(receipts,indent=2)+'\n');print('Verified',len(receipts),'source files')
