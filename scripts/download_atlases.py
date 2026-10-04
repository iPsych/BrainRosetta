"""Download public source assets for the offline build; never used by the app.

Run from repository root. Files are cached, and SHA256 receipts are written.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import subprocess
import shutil

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / '.cache/raw'
RAW.mkdir(parents=True, exist_ok=True)
CBIG = '634f676630929a71297852d01dd92a287103e861'
GITHUB = 'https://raw.githubusercontent.com/'
jobs = []

def add(name, url):
    jobs.append((name, url))

for n in range(100, 1001, 100):
    for variant in ['7Networks', '17Networks', 'Kong2022_17Networks']:
        base = f'Schaefer2018_{n}Parcels_{variant}_order'
        url = GITHUB + f'ThomasYeoLab/CBIG/{CBIG}/stable_projects/brain_parcellation/Schaefer2018_LocalGlobal/Parcellations/MNI/'
        add(base+'.txt', url+'freeview_lut/'+base+'.txt')
        for res in [1, 2]:
            fn=base+f'_FSLMNI152_{res}mm.nii.gz'
            add(fn, url+fn)
for fn in ['JulichBrainAtlas31_LH.nii.gz', 'JulichBrainAtlas31_RH.nii.gz', 'ICBM2009asym.nii.gz', 'Julich.json', 'README.md']:
    add('julich/'+fn,GITHUB+'niivue/niivue-demo-images/main/Juelich31/'+fn)
for fn in ['bnatlas.nii.gz', 'bnatlas.nii.txt']:
    add('brainnetome/'+fn,GITHUB+'brainnetome/bnatlasviewer/master/content/'+fn)
for scale in range(1,5):
    for suffix in ['.nii','_label.txt']:
        fn=f'Tian_Subcortex_S{scale}_3T'+suffix
        add('tian/'+fn,GITHUB+'yetianmed/subcortex/master/Group-Parcellation/3T/Subcortex-Only/'+fn)
add('tian/README.md',GITHUB+'yetianmed/subcortex/master/README.md')
for fn in ['atl-Anatom_space-MNI_dseg.nii','atl-Anatom.tsv']:
    add('suit/'+fn,GITHUB+'DiedrichsenLab/cerebellar_atlases/master/Diedrichsen_2009/'+fn)
add('suit/README.md',GITHUB+'DiedrichsenLab/cerebellar_atlases/master/README.md')
add('destrieux.tgz','https://www.nitrc.org/frs/download.php/11942/destrieux2009.tgz')
add('juelich-fsl.tgz','https://www.nitrc.org/frs/download.php/12096/Juelich.tgz')
add('mni152.nii.gz',GITHUB+'niivue/niivue-demo-images/main/mni152.nii.gz')
add('aal-original.tar.gz','https://www.gin.cnrs.fr/AAL_files/aal_for_SPM12.tar.gz')
add('aal3.tar.gz','https://www.gin.cnrs.fr/wp-content/uploads/AAL3v2_for_SPM12.tar.gz')
add('colin27.nii.gz','https://templateflow.s3.amazonaws.com/tpl-MNIColin27/tpl-MNIColin27_T1w.nii.gz')
add('colin27-mask.nii.gz','https://templateflow.s3.amazonaws.com/tpl-MNIColin27/tpl-MNIColin27_desc-brain_mask.nii.gz')
add('colin27-LICENSE.txt',GITHUB+'templateflow/tpl-MNIColin27/master/LICENSE')
for fn in ['Desikan_space-MNI152NLin6_res-2x2x2.nii.gz','Anatomical-labels-csv/Desikan.csv','Metadata-json/Desikan_space-MNI152NLin6_res-2x2x2.json']:
    add('desikan/'+fn.split('/')[-1],GITHUB+'neurodata/neuroparc/master/atlases/label/Human/'+fn)
add('desikan/LICENSE.md',GITHUB+'neurodata/neuroparc/master/LICENSE.md')
for fn in ['MNI_Glasser_HCP_v1.0.nii.gz','HCP-Multi-Modal-Parcellation-1.0.xml','README.md','LICENSE.md']:
    add('glasser/'+fn,GITHUB+'mbedini/The-HCP-MMP1.0-atlas-in-FSL/master/'+fn)
for fn in ['JHU-labels.xml','JHU-tracts.xml','JHU/JHU-ICBM-labels-2mm.nii.gz','JHU/JHU-ICBM-tracts-maxprob-thr25-2mm.nii.gz','JHU/JHU-ICBM-tracts-prob-2mm.nii.gz']:
    add('jhu/'+fn.split('/')[-1],'https://git.fmrib.ox.ac.uk/fsl/data_atlases/-/raw/master/'+fn+'?inline=false')

def download(job):
    name,url=job
    path=RAW/name
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists() or path.stat().st_size == 0:
        tmp=path.with_suffix(path.suffix+'.part')
        result=subprocess.run(['curl','-fLsS','--retry','2','--max-time','120',url,'-o',str(tmp)],capture_output=True,text=True)
        if result.returncode:
            return dict(file=name,url=url,error=result.stderr.strip())
        tmp.replace(path)
    result=dict(file=name,url=url,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size)
    print('Ready',name,flush=True)
    return result

def cached_nilearn_sources():
    """Keep all preprocessing inputs inside this project, including Nilearn datasets."""
    from nilearn.datasets import fetch_atlas_harvard_oxford, fetch_atlas_yeo_2011
    cache=RAW/'nilearn'
    sources=[('fsl','https://www.nitrc.org/frs/download.php/9902/HarvardOxford.tgz'),
             ('yeo_2011','ftp://surfer.nmr.mgh.harvard.edu/pub/data/Yeo_JNeurophysiol11_MNI152.zip')]
    for name,url in sources:
        dest=cache/name
        if not dest.exists():
            previous=Path.home()/'nilearn_data'/name
            if previous.exists():shutil.copytree(previous,dest)
            elif name=='fsl':fetch_atlas_harvard_oxford('cort-maxprob-thr25-2mm',data_dir=cache)
            else:fetch_atlas_yeo_2011(data_dir=cache)
        for path in sorted(dest.rglob('*')):
            if path.is_file():
                yield dict(file=str(path.relative_to(RAW)),url=url,archiveMember=str(path.relative_to(dest)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size)

if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=6) as pool:
        receipts=list(pool.map(download,jobs))
    receipts.extend(cached_nilearn_sources())
    (RAW/'receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
    errors=[r for r in receipts if 'error' in r]
    print(json.dumps(errors,indent=2))
    if errors: raise SystemExit(1)
