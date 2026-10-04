"""Offline ANTs SyN registration of the exact Colin27 and MNI2009c templates.

The resulting composite IMAGE transforms are pull mappings (fixed -> moving).
The browser uses their opposite-named POINT directions, verified independently.
"""
from pathlib import Path
import json, os, subprocess

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.cache/transforms'
WORK.mkdir(parents=True,exist_ok=True)
fixed=WORK/'2009-brain.nii.gz'
moving=ROOT/'public/data/colin27.nii.gz'
prefix=WORK/'colin-to-2009-'
command=['antsRegistration','--dimensionality','3','--float','1',
 '--output',f'[{prefix},{prefix}Warped.nii.gz,{prefix}InverseWarped.nii.gz]',
 '--interpolation','Linear','--winsorize-image-intensities','[0.005,0.995]',
 '--use-histogram-matching','1','--write-composite-transform','1',
 '--initial-moving-transform',f'[{fixed},{moving},1]']
for kind in ['Rigid[0.1]','Affine[0.1]']:
 command+=['--transform',kind,'--metric',f'MI[{fixed},{moving},1,32,Regular,0.25]',
 '--convergence','[1000x500x250x100,1e-6,10]','--shrink-factors','8x4x2x1',
 '--smoothing-sigmas','3x2x1x0vox']
command+=['--transform','SyN[0.1,3,0]','--metric',f'CC[{fixed},{moving},1,4]',
 '--convergence','[100x70x50x20,1e-6,10]','--shrink-factors','8x4x2x1',
 '--smoothing-sigmas','3x2x1x0vox','--verbose','1']
(WORK/'registration-command.json').write_text(json.dumps(command,indent=2)+'\n')
env={**os.environ,'ITK_GLOBAL_DEFAULT_NUMBER_OF_THREADS':'8','ANTS_RANDOM_SEED':'20261004'}
with open(WORK/'registration.log','w') as log:
 subprocess.run(command,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
print('Colin27 registration complete.')
