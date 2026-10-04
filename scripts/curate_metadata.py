"""Apply versioned navigation curation without changing source IDs or voxel data."""
from pathlib import Path
import json,re,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/data';RAW=ROOT/'.cache/raw'
BN={
 'SFG':('Frontal lobe','Superior frontal gyrus'),'MFG':('Frontal lobe','Middle frontal gyrus'),
 'IFG':('Frontal lobe','Inferior frontal gyrus'),'OrG':('Frontal lobe','Orbital gyrus'),
 'PrG':('Frontal lobe','Precentral gyrus'),'PCL':('Parietal lobe','Paracentral lobule'),
 'STG':('Temporal lobe','Superior temporal gyrus'),'MTG':('Temporal lobe','Middle temporal gyrus'),
 'ITG':('Temporal lobe','Inferior temporal gyrus'),'FuG':('Temporal lobe','Fusiform gyrus'),
 'PhG':('Temporal lobe','Parahippocampal gyrus'),'pSTS':('Temporal lobe','Posterior superior temporal sulcus'),
 'SPL':('Parietal lobe','Superior parietal lobule'),'IPL':('Parietal lobe','Inferior parietal lobule'),
 'PCun':('Parietal lobe','Precuneus'),'PoG':('Parietal lobe','Postcentral gyrus'),
 'INS':('Insula','Insular cortex'),'CG':('Cingulate cortex','Cingulate gyrus'),
 'MVOcC':('Occipital lobe','Medioventral occipital cortex'),'LOcC':('Occipital lobe','Lateral occipital cortex'),
 'Amyg':('Subcortical structures','Amygdala'),'Hipp':('Subcortical structures','Hippocampus'),
 'BG':('Subcortical structures','Basal ganglia'),'Tha':('Subcortical structures','Thalamus'),
}
ABBR={'SFG':'Superior frontal gyrus','MFG':'Middle frontal gyrus','IFG':'Inferior frontal gyrus','PostCG':'Postcentral gyrus','PreCG':'Precentral gyrus','STG':'Superior temporal gyrus','MTG':'Middle temporal gyrus','ITG':'Inferior temporal gyrus','IPL':'Inferior parietal lobule','SPL':'Superior parietal lobule','LOC':'Lateral occipital cortex','OFC':'Orbitofrontal cortex','pACC':'Pregenual anterior cingulate','sACC':'Subgenual anterior cingulate','pMCC':'Posterior midcingulate','aMCC':'Anterior midcingulate','HESCHL':'Heschl’s gyrus','PhG':'Parahippocampal gyrus','POperc':'Parietal operculum'}
for summary in json.loads((OUT/'catalog.json').read_text()):
    path=OUT/summary['manifest'];a=json.loads(path.read_text())
    if a['id']=='desikan':a['license']='Apache-2.0 (Neuroparc repository); original atlas attribution retained'
    for r in a['regions']:
        n=r['original'];base=re.sub(r'(_[LR]|-[lr]h| [LR])$','',n);base=re.sub(r'^(Left |Right |L_|R_)','',base)
        if n.startswith(('L_','Left_','Left ')) or n.endswith((' L','_L','-lh')):r['hemisphere']='L'
        elif n.startswith(('R_','Right_','Right ')) or n.endswith((' R','_R','-rh')):r['hemisphere']='R'
        if a['family']=='Brainnetome':
            parts=n.split('_');g,title=BN.get(parts[0],('Other structures',parts[0]));r['hemisphere']=parts[1]
            r['name']=title+' · '+parts[-1]+'/'+parts[-2];r['path']=[g,title,r['name']]
        elif a['family']=='Julich-Brain':
            m=re.search(r'\(([^)]+)\)',base);g=m.group(1) if m else 'Other mapped areas'
            g=ABBR.get(g,g);r['name']=base;r['path']=['Cytoarchitectonic regions',g,base]
        elif a['family']=='HCP-MMP / Glasser':
            # Source supplies area names, not a lobe hierarchy. Keep these groupings conservative.
            g='Visual areas' if base.startswith(('V1','V2','V3','V4','V6','V7','V8','LO','MST','MT','FST','PIT')) else 'Somatomotor areas' if base in ['1','2','3a','3b','4','6a','6d','6ma','6mp','6v'] else 'Other multimodal areas'
            r['name']=base;r['path']=[g,base]
        elif a['family']=='Desikan–Killiany':
            r['name']=base.replace('_',' ');r['path']=[r['path'][0],r['name']]
        elif a['family']=='Yeo':
            r['path']=['Functional networks'];r['hemisphere']='B'
        elif a['family'] not in ['AAL3','Schaefer']:
            r['name']=base.replace('_',' ');r['path']=[*r['path'][:(2 if a['family']=='Tian' else 1)],r['name']]
    a['hierarchyVersion']='brainrosetta-2026-10-01'
    path.write_text(json.dumps(a,ensure_ascii=False,separators=(',',':'))+'\n')

notices=OUT/'notices';notices.mkdir(exist_ok=True)
for source,dest in [
    ('aal3/AAL3_UserGuide_April2024.pdf','AAL3-user-guide.pdf'),
    ('julich/README.md','Julich-3.1-NOTICE.md'),('glasser/README.md','Glasser-volumetric-NOTICE.md'),
    ('glasser/LICENSE.md','Glasser-distribution-LICENSE.txt'),('desikan/LICENSE.md','Neuroparc-LICENSE.txt'),
    ('suit/README.md','Cerebellar-atlases-NOTICE.md'),('tian/README.md','Tian-NOTICE.md'),
    ('colin27-LICENSE.txt','Colin27-LICENSE.txt'),('icbm_other2tal.m','icbm_other2tal.m'),
]:
    if (RAW/source).exists():shutil.copyfile(RAW/source,notices/dest)
if (RAW/'receipts.json').exists():shutil.copyfile(RAW/'receipts.json',OUT/'source-receipts.json')
print('Curated all atlas metadata; copied source notices.')
