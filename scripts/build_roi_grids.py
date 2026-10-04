"""Record exact 1 mm reference grids for static browser ROI exports."""
from pathlib import Path
import hashlib, json
import nibabel as nib

ROOT=Path(__file__).resolve().parents[1]
sources=[
 ('MNI152NLin2009cAsym','.cache/transforms/2009-brain.nii.gz','TemplateFlow MNI2009c asymmetric nonlinear, 1 mm'),
 ('MNI152NLin6Asym','public/data/mni152.nii.gz','TemplateFlow FSL MNI152 asymmetric nonlinear, 1 mm'),
 ('MNIColin27','public/data/colin27.nii.gz','Colin27, 1 mm'),
]
grids=[]
for space,filename,label in sources:
 p=ROOT/filename;image=nib.load(p)
 grids.append(dict(id=space,space=space,label=label,dims=list(image.shape),affine=image.affine.tolist(),referenceSha256=hashlib.sha256(p.read_bytes()).hexdigest()))
(ROOT/'public/data/roi-grids.json').write_text(json.dumps(grids,indent=2)+'\n')
