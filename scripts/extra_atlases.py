from pathlib import Path
import csv,json,shutil
import xml.etree.ElementTree as ET
import numpy as np
import nibabel as nib

def build_extras(build,unpack,xml_labels,raw,out):
    jul=raw/'julich'; lut=json.loads((jul/'Julich.json').read_text())
    left=nib.load(jul/'JulichBrainAtlas31_LH.nii.gz');right=nib.load(jul/'JulichBrainAtlas31_RH.nii.gz')
    l=np.asarray(left.dataobj,dtype=np.uint16);r=np.asarray(right.dataobj,dtype=np.uint16)
    assert np.allclose(left.affine,right.affine)
    if np.any((l>0)&(r>0)):raise ValueError('Julich hemisphere overlap')
    labels={};rm={}
    for hemi,offset in [('L',0),('R',207)]:
        for i,name in enumerate(lut['labels']):
            if i==0:continue
            labels[i+offset]=name+'_'+hemi
            rm[i+offset]={'hemisphere':hemi,'sourceId':i,'color':'#'+''.join(f'{lut[c][i]:02x}' for c in ['R','G','B'])}
    merged=l+np.where(r>0,r+207,0)
    build('julich-3.1','Julich-Brain','Julich-Brain 3.1',nib.Nifti1Image(merged,left.affine),labels,'MNI152NLin2009cAsym','https://github.com/niivue/niivue-demo-images/tree/main/Juelich31','Amunts et al. (2020), Science. doi:10.1126/science.abb4588; Julich-Brain v3.1 (2023).','CC BY-NC-SA (original EBRAINS distribution)','Maximum-probability map',rm,notes='Losslessly cropped NiiVue distribution of Julich-Brain 3.1. Right hemisphere IDs offset by 207; original IDs retained as sourceId. Display includes gap-map regions. No probability is inferred from a maximum-probability label.')
    shutil.copyfile(jul/'ICBM2009asym.nii.gz',out/'mni2009.nii.gz')
    shutil.copyfile(jul/'README.md',out/'Julich-NOTICE.txt')
    d=unpack('juelich-fsl.tgz','juelich-fsl')/'data/atlases'
    build('juelich-fsl','Juelich (FSL)','Juelich histological',d/'Juelich/Juelich-maxprob-thr25-2mm.nii.gz',xml_labels(d/'Juelich.xml'),'MNI152NLin6Asym','https://fsl.fmrib.ox.ac.uk/fsl/docs/other/datasets.html','Eickhoff et al. (2005), NeuroImage 25:1325–1335.','FSL atlas distribution; see source terms','FSL · 25% threshold · 2 mm',prob=d/'Juelich/Juelich-prob-2mm.nii.gz',notes='Older FSL Juelich atlas; distinct from Julich-Brain 3.1. Probabilities are available for the top three candidate areas.')
    ho=raw/'nilearn/fsl/data/atlases'
    for part,title in [('cort','Cortical'),('sub','Subcortical')]:
        build(f'harvard-oxford-{part}','Harvard–Oxford','Harvard–Oxford '+title.lower(),ho/f'HarvardOxford/HarvardOxford-{part}-maxprob-thr25-2mm.nii.gz',xml_labels(ho/f'HarvardOxford-{title}.xml'),'MNI152NLin6Asym','https://fsl.fmrib.ox.ac.uk/fsl/docs/other/datasets.html','Harvard–Oxford cortical and subcortical structural atlases, FSL.','FSL atlas distribution; see source terms',f'{title} · 25% threshold · 2 mm',prob=ho/f'HarvardOxford/HarvardOxford-{part}-prob-2mm.nii.gz')
    lines=(raw/'brainnetome/bnatlas.nii.txt').read_text().splitlines();labels={int(l.split()[0]):l.split(maxsplit=1)[1] for l in lines if l.strip()}
    build('brainnetome','Brainnetome','Brainnetome 246',raw/'brainnetome/bnatlas.nii.gz',labels,'MNI152-HCP40','https://github.com/brainnetome/bnatlasviewer','Fan et al. (2016), Cerebral Cortex. doi:10.1093/cercor/bhw157','Brainnetome atlas source terms','246 regions',region_meta={i:dict(hemisphere='L' if i%2 else 'R') for i in labels},notes='Source: Brainnetome authors’ viewer distribution. MNI HCP40 reference is kept distinct from FSL MNI152.')
    for scale in range(1,5):
        fn=f'Tian_Subcortex_S{scale}_3T';labels={i+1:n.strip() for i,n in enumerate((raw/f'tian/{fn}_label.txt').read_text().splitlines()) if n.strip()}
        build(f'tian-s{scale}','Tian','Tian subcortex',raw/f'tian/{fn}.nii',labels,'MNI152NLin6Asym','https://github.com/yetianmed/subcortex','Tian et al. (2020), Nature Neuroscience. doi:10.1038/s41593-020-00711-6','Author repository; cite original atlas',f'Scale {scale} · 3 T')
    rows=list(csv.DictReader(open(raw/'suit/atl-Anatom.tsv'),delimiter='\t'));labels={int(r['index']):r['name'] for r in rows}
    rm={int(r['index']):dict(color=r['color'],hemisphere='L' if r['name'].startswith('Left') else 'R' if r['name'].startswith('Right') else 'M') for r in rows}
    build('suit','SUIT','Cerebellar anatomy',raw/'suit/atl-Anatom_space-MNI_dseg.nii',labels,'MNI152NLin6Asym','https://github.com/DiedrichsenLab/cerebellar_atlases','Diedrichsen et al. (2009), NeuroImage 46:39–46. doi:10.1016/j.neuroimage.2009.01.045','CC BY', 'Diedrichsen 2009 · MNI',rm,notes='Published MNI representation, not the separate SUIT reference-space volume.')
    d=unpack('destrieux.tgz','destrieux');rows=list(csv.DictReader(open(d/'destrieux2009_rois_labels_lateralized.csv')))
    labels={int(r['index']):r['name'] for r in rows}
    build('destrieux','Destrieux','Destrieux 2009',d/'destrieux2009_rois_lateralized.nii.gz',labels,'MNI152NLin6Asym','https://www.nitrc.org/projects/brainvisa_ext','Destrieux et al. (2010), NeuroImage 53:1–15. doi:10.1016/j.neuroimage.2010.06.010','See source distribution README','Lateralized volume',notes='Volumetric distribution from Nilearn/NITRC; original FreeSurfer surface parcellation is a distinct representation.')
    d=unpack('aal-original.tar.gz','aal-original');im=next(d.rglob('AAL.nii'));xml=next(d.rglob('AAL.xml'))
    build('aal','AAL','AAL original',im,xml_labels(xml),'MNIColin27','https://www.gin.cnrs.fr/en/tools/aal/','Tzourio-Mazoyer et al. (2002), NeuroImage 15:273–289.','GPL; see source distribution','SPM12 · 116 regions')
    rows=list(csv.reader(open(raw/'desikan/Desikan.csv')));labels={int(r[0]):r[1] for r in rows if r}
    build('desikan','Desikan–Killiany','Desikan–Killiany',raw/'desikan/Desikan_space-MNI152NLin6_res-2x2x2.nii.gz',labels,'MNI152NLin6Asym','https://github.com/neurodata/neuroparc','Desikan et al. (2006), NeuroImage 31:968–980. doi:10.1016/j.neuroimage.2006.01.021','Apache-2.0 (Neuroparc distribution)','Neuroparc volume · 2 mm',region_meta={i:dict(hemisphere='L' if n.startswith('L_') else 'R') for i,n in labels.items()},notes='Neuroparc volumetric derivative, with 70 nonzero labels including source white-matter/corpus-callosum entries. Not a subject-specific FreeSurfer parcellation.')
    labels={int(n.get('index')):n.text.strip() for n in ET.parse(raw/'glasser/HCP-Multi-Modal-Parcellation-1.0.xml').findall('.//label') if int(n.get('index'))>0}
    build('glasser','HCP-MMP / Glasser','HCP-MMP 1.0',raw/'glasser/MNI_Glasser_HCP_v1.0.nii.gz',labels,'MNI152NLin2009cAsym','https://github.com/mbedini/The-HCP-MMP1.0-atlas-in-FSL','Glasser et al. (2016), Nature 536:171–178. doi:10.1038/nature18933; Beauchamp/Robinson AFNI volumetric derivative.','GPL-3.0 (distribution); original atlas terms apply','360 regions · volumetric projection',region_meta={i:dict(hemisphere='L' if n.startswith('L_') else 'R') for i,n in labels.items()},notes='Exploratory volumetric projection distributed via AFNI/Bedini; not the original surface-native HCP-MMP atlas. The source cautions against treating volumetric registration as equivalent to surface-based localization.')
    for kind in ['labels','tracts']:
        root=ET.parse(raw/f'jhu/JHU-{kind}.xml')
        labels={int(n.get('index'))+(1 if kind=='tracts' else 0):n.text.strip() for n in root.findall('.//label')}
        filename='JHU-ICBM-labels-2mm.nii.gz' if kind=='labels' else 'JHU-ICBM-tracts-maxprob-thr25-2mm.nii.gz'
        build('jhu-'+kind,'JHU','JHU white matter',raw/'jhu'/filename,labels,'MNI152NLin6Asym','https://git.fmrib.ox.ac.uk/fsl/data_atlases','Mori et al. (2008), NeuroImage 40:570–582; Hua et al. (2008), NeuroImage 39:336–347.','FSL atlas distribution; see source terms','ICBM-DTI labels · 2 mm' if kind=='labels' else 'Tract probabilities · 25% threshold · 2 mm',prob=raw/'jhu/JHU-ICBM-tracts-prob-2mm.nii.gz' if kind=='tracts' else None)
    yeo=raw/'nilearn/yeo_2011/Yeo_JNeurophysiol11_MNI152'
    for n in [7,17]:
        entries=[l.split() for l in (yeo/f'Yeo2011_{n}Networks_ColorLUT.txt').read_text().splitlines() if l.strip() and not l.startswith('#')]
        labels={int(l[0]):l[1] for l in entries};rm={int(l[0]):dict(color='#'+''.join(f'{int(v):02x}' for v in l[2:5])) for l in entries}
        if n==7:
            labels.update(dict(enumerate(['Background','Visual','Somatomotor','Dorsal attention','Ventral attention','Limbic','Frontoparietal control','Default mode'])))
        im=nib.load(yeo/f'Yeo2011_{n}Networks_MNI152_FreeSurferConformed1mm.nii.gz');a=np.asarray(im.dataobj).squeeze()
        build(f'yeo-{n}','Yeo','Yeo 2011',nib.Nifti1Image(a,im.affine),labels,'MNI152NLin6Asym','https://surfer.nmr.mgh.harvard.edu/fswiki/CorticalParcellation_Yeo2011','Yeo et al. (2011), Journal of Neurophysiology 106:1125–1165. doi:10.1152/jn.00338.2011','FreeSurfer/Yeo atlas distribution; cite original paper',f'{n} networks · tight cortical mask',rm)
