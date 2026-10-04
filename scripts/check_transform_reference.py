"""Cross-check prepared reference points against the independent ANTs CLI."""
from pathlib import Path
import csv,json,subprocess
import numpy as np

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.cache/transforms';DATA=ROOT/'public/data/transforms'
fixtures=json.loads((DATA/'fixtures.json').read_text());report=json.loads((DATA/'validation.json').read_text())
files={'tf-2009-to-6':'tf-6-to-2009-image.h5','tf-6-to-2009':'tf-6-to-2009-image.h5','syn-2009-to-colin':'colin-to-2009-Composite.h5','syn-colin-to-2009':'colin-to-2009-InverseComposite.h5'}
for id,file in files.items():
 rows=[f for f in fixtures if f['transform']==id]
 p=np.array([r['input'] for r in rows]);expected=np.array([r['expected'] for r in rows])
 if id=='tf-6-to-2009':p,expected=expected,p # Test inverse residual through native forward transform.
 source=WORK/(id+'-points.csv');dest=WORK/(id+'-ants.csv')
 with source.open('w') as stream:
  writer=csv.writer(stream);writer.writerow(['x','y','z']);writer.writerows(p*[-1,-1,1])
 subprocess.run(['antsApplyTransformsToPoints','-d','3','-i',str(source),'-o',str(dest),'-t',str(WORK/file)],check=True,capture_output=True,text=True)
 with dest.open() as stream:actual=np.array([[float(r[c]) for c in ['x','y','z']] for r in csv.DictReader(stream)])*[-1,-1,1]
 error=np.linalg.norm(actual-expected,axis=1);assert error.max()<.002,(id,error.max())
 record=next(r for r in report['accepted'] if r['id']==id);record['antsCliCheck']=dict(count=len(error),maxErrorMm=float(error.max()),inverseResidualCheck=id=='tf-6-to-2009')
 print(id,'ANTs CLI max error (mm)',error.max())
report['registrationProvenance']={'engine':subprocess.check_output(['antsRegistration','--version'],text=True).strip(),'inputSha256':{p.name:__import__('hashlib').sha256(p.read_bytes()).hexdigest() for p in [ROOT/'public/data/colin27.nii.gz',WORK/'2009-brain.nii.gz']},'compositeSha256':{p.name:__import__('hashlib').sha256(p.read_bytes()).hexdigest() for p in WORK.glob('colin-to-2009-*Composite.h5')}}
(DATA/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
command=json.loads((WORK/'registration-command.json').read_text());command=[arg.replace(str(ROOT)+'/', '') for arg in command]
(DATA/'registration-command.json').write_text(json.dumps(command,indent=2)+'\n')
