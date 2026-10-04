"""Build static, skull-stripped template contexts in their own reference spaces."""
from build_atlases import RAW,OUT,mesh,mesh_bytes
import gzip, shutil
import numpy as np
import nibabel as nib
from scipy import ndimage

for image,mask,outname,meshname in [
    (RAW/'colin27.nii.gz',RAW/'colin27-mask.nii.gz','colin27.nii.gz','braincolin.bin.gz'),
    (RAW/'julich/ICBM2009asym.nii.gz',None,'mni2009.nii.gz','brain2009.bin.gz'),
    (RAW/'mni152.nii.gz',None,'mni152.nii.gz','brain.bin.gz'),
]:
    im=nib.load(image);a=np.asarray(im.dataobj).copy()
    if mask:
        mi=nib.load(mask)
        assert mi.shape==im.shape and np.allclose(mi.affine,im.affine)
        m=np.asarray(mi.dataobj)>0;a[~m]=0
        m=m&(a>np.percentile(a[m],28))
    else:
        m=a>np.percentile(a[a>0],24)
    ni=nib.Nifti1Image(a,im.affine);ni.header.set_xyzt_units('mm');nib.save(ni,OUT/outname)
    # Fill internal cavities without flattening the outer cortical contour.
    m=ndimage.binary_fill_holes(m)
    v,f=mesh(m,im.affine,[0,0,0],70000)
    (OUT/meshname).write_bytes(gzip.compress(mesh_bytes([(0,v,f)]),mtime=0))
    print('Template',outname,len(f)//3,flush=True)
