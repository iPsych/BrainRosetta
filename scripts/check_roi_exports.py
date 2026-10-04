"""Independent checks of the ROI files saved by the Playwright export tests.

Run the ROI browser tests first. NiBabel verifies the native mask and ANTs
independently resamples JHU label 3 into the original TemplateFlow 2009c grid.
The numerical agreement is not a claim of anatomical registration accuracy.
"""
from pathlib import Path
import hashlib,json,subprocess
import nibabel as nib
import numpy as np

ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'public/data';WORK=ROOT/'.cache'
native_file=Path('/private/tmp/brainrosetta-roi-native.nii')
warped_file=Path('/private/tmp/brainrosetta-roi-mni2009.nii')
native=nib.load(native_file);aal=nib.load(DATA/'aal3-1mm/labels.nii.gz')
assert native.shape==aal.shape and np.array_equal(native.affine,aal.affine)
assert native.get_data_dtype()==np.uint8 and native.header.get_xyzt_units()[0]=='mm'
assert np.array_equal(np.asarray(native.dataobj),np.isin(np.asarray(aal.dataobj),[1,2]))
im=nib.load(DATA/'jhu-labels/labels.nii.gz');mask=(np.asarray(im.dataobj)==3).astype(np.uint8)
nib.save(nib.Nifti1Image(mask,im.affine),WORK/'roi-jhu3-native.nii.gz')
subprocess.run(['antsApplyTransforms','-d','3','-i',str(WORK/'roi-jhu3-native.nii.gz'),'-r',str(WORK/'transforms/2009-brain.nii.gz'),'-o',str(WORK/'roi-jhu3-reference.nii.gz'),'-n','NearestNeighbor','-t',str(WORK/'transforms/tf-6-to-2009-image.h5')],check=True)
reference=nib.load(WORK/'roi-jhu3-reference.nii.gz');warped=nib.load(warped_file)
assert reference.shape==warped.shape and np.array_equal(reference.affine,warped.affine)
a=np.asarray(reference.dataobj)>0;b=np.asarray(warped.dataobj)>0
dice=2*np.count_nonzero(a&b)/(np.count_nonzero(a)+np.count_nonzero(b));assert dice>.99
report=dict(native=dict(atlas='aal3-1mm',regions=[1,2],exactVoxelMatch=True,exactAffineMatch=True,sha256=hashlib.sha256(native_file.read_bytes()).hexdigest()),
 nonlinear=dict(atlas='jhu-labels',regions=[3],target='MNI152NLin2009cAsym',referenceEngine='antsApplyTransforms',antsSuiteVersion=subprocess.check_output(['antsRegistration','--version'],text=True).strip(),
 referenceTransformSha256=hashlib.sha256((WORK/'transforms/tf-6-to-2009-image.h5').read_bytes()).hexdigest(),referenceVoxels=int(a.sum()),browserVoxels=int(b.sum()),differentVoxels=int(np.count_nonzero(a!=b)),dice=float(dice),sha256=hashlib.sha256(warped_file.read_bytes()).hexdigest()),
 scope='One native and one nonlinear browser export independently checked. Small boundary differences arise from packaged displacement interpolation. These numerical checks do not establish whole-brain anatomical accuracy.')
(DATA/'roi-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
