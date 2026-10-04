"""Prepare immutable static volumes, meshes and manifests. No runtime Python.

Native label grids remain untouched. Meshes are visualization derivatives.
"""
from pathlib import Path
import argparse, csv, gzip, hashlib, json, re, shutil, struct, sys, tarfile
import xml.etree.ElementTree as ET
import numpy as np
import nibabel as nib
from scipy import ndimage
from skimage.measure import marching_cubes
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.cache/python'))
import fast_simplification
from aal_hierarchy import hierarchy
RAW=ROOT/'.cache/raw'; OUT=ROOT/'public/data'
OUT.mkdir(parents=True,exist_ok=True)
PALETTE=['#438c9e','#bf8b62','#8b85b5','#67a38e','#c77a8e','#6d98be','#b8a257','#9c829b','#729eab','#c49585']
catalog=[]; validation=[]

def js(path,obj):
    path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')

def unpack(filename,folder):
    dest=RAW/folder;dest.mkdir(exist_ok=True)
    if (RAW/filename).exists():
        with tarfile.open(RAW/filename) as tar:
            for m in tar.getmembers():
                if m.isfile():
                    p=dest/m.name
                    if not p.resolve().is_relative_to(dest.resolve()):raise ValueError('Unsafe archive path')
                    if not p.exists():p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(tar.extractfile(m).read())
    return dest

def mesh(mask,affine,offset,target=1600):
    p=np.pad(mask.astype(np.float32),1)
    smooth=ndimage.gaussian_filter(p,.55)
    if smooth.max()<.55:smooth=p
    v,f,_,_=marching_cubes(smooth,.5,allow_degenerate=False)
    v=nib.affines.apply_affine(affine,v+np.asarray(offset)-1)
    if np.linalg.det(affine[:3,:3])<0:f=f[:,::-1].copy()
    if len(f)>target:
        v,f=fast_simplification.simplify(v.astype(np.float64),f.astype(np.int32),target_count=target,agg=5)
    return v.astype('<f4'),f.astype('<u4').ravel()

def mesh_bytes(parts):
    chunks=[struct.pack('<I',len(parts))]
    for id,v,f in parts:chunks.extend([struct.pack('<III',id,len(v),len(f)),v.tobytes(),f.tobytes()])
    return b''.join(chunks)

def xml_labels(path):
    root=ET.parse(path)
    nodes=root.findall('.//label')
    if nodes and nodes[0].get('index') is not None:
        return {int(n.get('index'))+1:n.text.strip() for n in nodes}
    return {int(n.findtext('index')):n.findtext('name') for n in nodes}

def generic_group(name,family):
    clean=name.replace('_',' ')
    if family=='Schaefer':
        parts=name.split('_'); net=parts[2] if len(parts)>2 else 'Network'
        full={'Vis':'Visual','SomMot':'Somatomotor','DorsAttn':'Dorsal attention','SalVentAttn':'Salience / ventral attention','Limbic':'Limbic','Cont':'Control','Default':'Default mode','TempPar':'Temporal parietal'}
        network=next((v+(' '+net[len(k):] if net[len(k):] else '') for k,v in full.items() if net.startswith(k)),net)
        return clean,[network, 'Left hemisphere' if '_LH_' in name else 'Right hemisphere']
    if family=='Tian':
        group=next((v for k,v in {'HIP':'Hippocampus','THA':'Thalamus','CAU':'Caudate','PUT':'Putamen','PAL':'Globus pallidus','AMY':'Amygdala','NAc':'Nucleus accumbens'}.items() if k.lower() in name.lower()),'Subcortex')
        return clean,['Subcortical structures',group]
    low=clean.lower()
    rules=[('Cerebellum',['cerebell','vermis','lobule','crus']),('Thalamus',['thalam','thal ','geniculate','pulvinar']),('Basal ganglia',['caudate','putamen','pallid','accumbens','striat']),('Medial temporal',['hippocamp','amygdal','entorhin']),('Frontal',['frontal','precentral','rectus','supplementary']),('Parietal',['parietal','postcentral','angular','supramarg','precune']),('Occipital',['occipital','calcarine','cuneus','lingual','hoc','visual']),('Temporal',['temporal','heschl','fusiform','te1','te 1']),('Cingulate',['cingul','p24','p32','s24','s32']),('Insula',['insula']),('Brainstem',['brainstem','substantia','raphe','coeruleus','red nucleus','tegment'])]
    group=next((g for g,keys in rules if any(k in low for k in keys)),'Other regions')
    if family=='SUIT':group='Vermis' if 'vermis' in low else 'Hemispheric lobules'
    if family=='JHU':group='White matter'
    return clean,[group]

def build(id,family,name,img,labels,space,source,citation,license,variant='',region_meta=None,mesh_id=None,prob=None,notes=''):
    folder=OUT/id;folder.mkdir(exist_ok=True)
    if (folder/'manifest.json').exists():
        meta=json.loads((folder/'manifest.json').read_text())
        summary={k:meta[k] for k in ['id','family','name','variant','space','resolution','regionCount']};summary['manifest']=f'{id}/manifest.json';catalog.append(summary)
        print('Cached',id,flush=True)
        return
    im=nib.load(str(img)) if isinstance(img,(str,Path)) else img
    data=np.asarray(im.dataobj,dtype=np.uint16)
    if data.ndim!=3:raise ValueError(f'{id}: expected 3D labels')
    ids=np.unique(data);ids=ids[ids!=0]
    missing=set(map(int,ids))-set(labels)
    if missing:raise ValueError(f'{id}: label names missing: {missing}')
    # Always store an explicit little-endian, x-fastest lookup volume.
    (folder/'labels.bin.gz').write_bytes(gzip.compress(data.astype('<u2').tobytes(order='F'),mtime=0))
    ni=nib.Nifti1Image(data,im.affine);ni.header.set_xyzt_units('mm');ni.header.set_intent('label');nib.save(ni,folder/'labels.nii.gz')
    boxes=ndimage.find_objects(data);regions=[];meshes=[]
    voxel_volume=abs(np.linalg.det(im.affine[:3,:3]))
    for id_value in ids:
        rid=int(id_value);box=boxes[rid-1]; crop=data[box]==rid;off=[s.start for s in box]
        points=np.argwhere(crop)+off;center=points.mean(0)
        # A real in-region voxel, rather than an arithmetic centroid outside the ROI.
        world=nib.affines.apply_affine(im.affine,points)
        centroid=nib.affines.apply_affine(im.affine,center)
        anchor=world[np.argmin(np.sum((world-centroid)**2,axis=1))]
        original=labels[rid];title,path=generic_group(original,family)
        meta=(region_meta or {}).get(rid,{})
        if family=='AAL3':title,path=hierarchy(original)
        hemi='L' if original.endswith(('_L','-lh')) or '_LH_' in original or original.startswith(('Left ','left ')) else 'R' if original.endswith(('_R','-rh')) or '_RH_' in original or original.startswith(('Right ','right ')) else 'B'
        if 'hemisphere' in meta:hemi=meta['hemisphere']
        color=meta.get('color',PALETTE[int(hashlib.md5(path[0].encode()).hexdigest()[:6],16)%len(PALETTE)])
        r=dict(id=rid,name=title,original=original,hemisphere=hemi,path=path,color=color,centroid=np.round(centroid,4).tolist(),focus=np.round(anchor,4).tolist(),voxelCount=len(points),volume=round(len(points)*voxel_volume,3),**{k:v for k,v in meta.items() if k not in ['hemisphere','color']})
        regions.append(r)
        if not mesh_id:
            v,f=mesh(crop,im.affine,off);meshes.append((rid,v,f))
    if not mesh_id:(folder/'meshes.bin.gz').write_bytes(gzip.compress(mesh_bytes(meshes),mtime=0))
    meta=dict(id=id,family=family,name=name,variant=variant,space=space,resolution=[round(float(x),3) for x in nib.affines.voxel_sizes(im.affine)],regionCount=len(regions),dims=list(data.shape),affine=im.affine.tolist(),inverseAffine=np.linalg.inv(im.affine).tolist(),regions=regions,labels=f'{id}/labels.bin.gz',nifti=f'{id}/labels.nii.gz',meshes=f'{mesh_id or id}/meshes.bin.gz',source=source,citation=citation,license=license,notes=notes,hierarchySource='BrainRosetta navigation curation; source labels preserved',sha256=hashlib.sha256(data.astype('<u2').tobytes(order='F')).hexdigest())
    if prob:
        pimg=nib.load(str(prob));p=np.asarray(pimg.dataobj)
        if p.shape[:3]!=data.shape or not np.allclose(pimg.affine,im.affine):raise ValueError('Probability geometry mismatch')
        # Preserve source probabilities exactly as uint8 percentage volumes (FSL distributions).
        if p.max()<=1:p=p*100
        pi=np.argsort(p,axis=3)[...,-3:][...,::-1]
        vals=np.take_along_axis(p,pi,axis=3)
        packed=np.empty((*data.shape,3,2),dtype='<u2');packed[:,:,:, :,0]=pi+1;packed[:,:,:, :,1]=np.round(vals)
        (folder/'probabilities.bin.gz').write_bytes(gzip.compress(packed.tobytes(order='C'),mtime=0))
        meta['probabilities']=f'{id}/probabilities.bin.gz'
        meta['probabilityNote']='Top three source probabilities, percent; labels use the selected maximum-probability threshold.'
    js(folder/'manifest.json',meta)
    summary={k:meta[k] for k in ['id','family','name','variant','space','resolution','regionCount']};summary['manifest']=f'{id}/manifest.json';catalog.append(summary)
    validation.append(dict(atlas=id,regions=len(regions),allFocusPointsInside=True,sourceGridPreserved=True))
    print('Built',id,len(regions),flush=True)

def main(only):
    aal=RAW/'aal3/AAL3v1_1mm.nii'
    if not aal.exists():
        d=unpack('aal3.tar.gz','aal3-source');aal=next(d.rglob('AAL3v1_1mm.nii'))
    rows=list(csv.DictReader(open(ROOT/'AAL3v1_region_locations_1mm.csv')))
    labels={int(r['label_id']):r['region_name'] for r in rows}
    rm={int(r['label_id']):dict(abbreviation=r['abbreviation'],hemisphere={'Midline':'M'}.get(r['hemisphere'],r['hemisphere'])) for r in rows}
    build('aal3-1mm','AAL3','AAL3',aal,labels,'MNIColin27','https://www.gin.cnrs.fr/en/tools/aal/','Rolls et al. (2020), NeuroImage 206:116189. doi:10.1016/j.neuroimage.2019.116189','GPL; see source AAL3 user guide','166 regions · 1 mm',rm,notes='AAL3v1_1mm image from the April 2024 AAL3v2 distribution. All 166 voxel counts and centroids match the supplied CSV. Navigation groups are curated, not an official AAL hierarchy.')
    # Native template used as anatomical context for the MNI152NLin6Asym family.
    mni=RAW/'fsl-mni152-brain.nii.gz'
    if mni.exists():
        shutil.copyfile(mni,OUT/'mni152.nii.gz')
        im=nib.load(mni);data=np.asarray(im.dataobj);mask=ndimage.binary_fill_holes(data>np.percentile(data[data>0],22))
        v,f=mesh(mask,im.affine,[0,0,0],60000)
        (OUT/'brain.bin.gz').write_bytes(gzip.compress(mesh_bytes([(0,v,f)]),mtime=0))
    if only=='aal':
        js(OUT/'catalog.json',catalog);return
    # Schaefer meshes at 2 mm; lookup grids provided at both native resolutions.
    for n in range(100,1001,100):
        for variant,title in [('7Networks','Yeo 7 networks'),('17Networks','Yeo 17 networks'),('Kong2022_17Networks','Kong 17 networks')]:
            prefix=f'Schaefer2018_{n}Parcels_{variant}_order'; lut=RAW/(prefix+'.txt')
            if not lut.exists():continue
            lines=[l.split() for l in lut.read_text().splitlines() if l.strip()];labels={int(l[0]):l[1] for l in lines};rm={int(l[0]):dict(color='#'+''.join(f'{int(v):02x}' for v in l[2:5])) for l in lines}
            for res in [2,1]:
                fn=RAW/(prefix+f'_FSLMNI152_{res}mm.nii.gz');id=f'schaefer-{n}-{variant}-{res}mm'
                if fn.exists():build(id,'Schaefer',f'Schaefer {n}',fn,labels,'MNI152NLin6Asym','https://github.com/ThomasYeoLab/CBIG/tree/master/stable_projects/brain_parcellation/Schaefer2018_LocalGlobal','Schaefer et al. (2018), Cerebral Cortex. doi:10.1093/cercor/bhx179','MIT',f'{title} · {res} mm',rm,mesh_id=f'schaefer-{n}-{variant}-2mm' if res==1 else None,notes='Native lookup grid; visualization meshes derived from the corresponding 2 mm map. CBIG source commit 634f676630929a71297852d01dd92a287103e861.')
    # Additional atlas builders are kept separate so asset failures are explicit.
    from extra_atlases import build_extras
    build_extras(build,unpack,xml_labels,RAW,OUT)
    js(OUT/'catalog.json',catalog)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--only',default='all',choices=['all','aal']);args=parser.parse_args();main(args.only)
