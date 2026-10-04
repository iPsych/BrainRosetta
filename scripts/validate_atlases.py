"""Independent audit of every shipped voxel grid, region anchor, and display mesh."""
from pathlib import Path
import csv, gzip, hashlib, json, struct
import numpy as np
import nibabel as nib

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'public/data'
reports=[]
mesh_cache={}
for summary in json.loads((DATA/'catalog.json').read_text()):
    a=json.loads((DATA/summary['manifest']).read_text())
    raw=gzip.decompress((DATA/a['labels']).read_bytes())
    assert hashlib.sha256(raw).hexdigest()==a['sha256'],a['id']
    grid=np.frombuffer(raw,dtype='<u2').reshape(a['dims'],order='F')
    ni=nib.load(DATA/a['nifti'])
    assert np.array_equal(grid,np.asarray(ni.dataobj)),a['id']
    affine=np.array(a['affine']);inv=np.array(a['inverseAffine'])
    assert np.allclose(affine,ni.affine) and np.allclose(inv@affine,np.eye(4)),a['id']
    ids=set(np.unique(grid))-{0};regions={r['id']:r for r in a['regions']}
    assert ids==set(regions) and len(ids)==a['regionCount'],a['id']
    counts=np.bincount(grid.ravel());voxel_volume=abs(np.linalg.det(affine[:3,:3]))
    for rid,r in regions.items():
        ijk=np.rint(nib.affines.apply_affine(inv,r['focus'])).astype(int)
        assert grid[tuple(ijk)]==rid,(a['id'],rid,'focus')
        assert counts[rid]==r['voxelCount'],(a['id'],rid,'count')
        assert abs(counts[rid]*voxel_volume-r['volume'])<.002,(a['id'],rid,'volume')
        assert r['path'] and r['name'] and r['original'],(a['id'],rid,'metadata')
    if a['meshes'] not in mesh_cache:
        blob=gzip.decompress((DATA/a['meshes']).read_bytes());count=struct.unpack_from('<I',blob)[0];offset=4;mesh_ids=set()
        for _ in range(count):
            rid,nv,ni=struct.unpack_from('<III',blob,offset);offset+=12
            verts=np.frombuffer(blob,dtype='<f4',count=nv*3,offset=offset);offset+=nv*12
            faces=np.frombuffer(blob,dtype='<u4',count=ni,offset=offset);offset+=ni*4
            assert np.isfinite(verts).all() and nv>0 and ni%3==0 and faces.max()<nv,a['meshes']
            mesh_ids.add(rid)
        assert offset==len(blob),a['meshes']
        mesh_cache[a['meshes']]=mesh_ids
    assert mesh_cache[a['meshes']]==ids,a['id']
    if a.get('probabilities'):
        p=np.frombuffer(gzip.decompress((DATA/a['probabilities']).read_bytes()),dtype='<u2').reshape(*a['dims'],3,2)
        assert p[...,1].max()<=100 and (np.diff(p[...,1].astype(int),axis=-1)<=0).all(),a['id']
    reports.append(dict(atlas=a['id'],regions=len(ids),sha256=a['sha256'],gridMatchesNifti=True,allFocusPointsInside=True,voxelCountsAndVolumes=True,meshIndicesValid=True))
    print('Verified',a['id'],len(ids),flush=True)

aal=json.loads((DATA/'aal3-1mm/manifest.json').read_text());lookup={r['id']:r for r in aal['regions']}
for supplied in csv.DictReader(open(ROOT/'AAL3v1_region_locations_1mm.csv')):
    r=lookup[int(supplied['label_id'])]
    assert r['voxelCount']==int(supplied['voxel_count'])
    assert np.allclose(r['centroid'],[float(supplied[f'mni_centroid_{axis}_mm']) for axis in 'xyz'],atol=.0001)
(DATA/'validation.json').write_text(json.dumps({'atlasCount':len(reports),'aal3SuppliedCsvMatches':True,'checks':reports},indent=2)+'\n')
print(f'PASS: {len(reports)} atlases; {sum(r["regions"] for r in reports)} region records; AAL3 matches supplied CSV.')
