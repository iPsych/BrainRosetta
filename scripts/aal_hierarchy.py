"""Explicit BrainRosetta navigation curation, separate from AAL label identities."""
GROUPS = {
 'Frontal lobe': 'Precentral Frontal_Sup_2 Frontal_Mid_2 Frontal_Inf_Oper Frontal_Inf_Tri Frontal_Inf_Orb_2 Rolandic_Oper Supp_Motor_Area Olfactory Frontal_Sup_Medial Frontal_Med_Orb Rectus OFCmed OFCant OFCpost OFClat',
 'Insula': 'Insula',
 'Cingulate cortex': 'Cingulate_Mid Cingulate_Post ACC_sub ACC_pre ACC_sup',
 'Medial temporal structures': 'Hippocampus ParaHippocampal Amygdala',
 'Occipital lobe': 'Calcarine Cuneus Lingual Occipital_Sup Occipital_Mid Occipital_Inf',
 'Temporal lobe': 'Fusiform Heschl Temporal_Sup Temporal_Pole_Sup Temporal_Mid Temporal_Pole_Mid Temporal_Inf',
 'Parietal lobe': 'Postcentral Parietal_Sup Parietal_Inf SupraMarginal Angular Precuneus Paracentral_Lobule',
 'Basal ganglia': 'Caudate Putamen Pallidum Vent_Str',
 'Brainstem nuclei': 'VTA SN_pc SN_pr Red_N LC Raphe_D Raphe_M',
}
NAMES = {
 'Precentral':'Precentral gyrus','Frontal_Sup_2':'Superior frontal gyrus','Frontal_Mid_2':'Middle frontal gyrus',
 'Frontal_Inf_Oper':'Inferior frontal · opercular','Frontal_Inf_Tri':'Inferior frontal · triangular','Frontal_Inf_Orb_2':'Inferior frontal · orbital',
 'Rolandic_Oper':'Rolandic operculum','Supp_Motor_Area':'Supplementary motor area','Olfactory':'Olfactory cortex',
 'Frontal_Sup_Medial':'Medial superior frontal gyrus','Frontal_Med_Orb':'Medial orbital frontal gyrus','Rectus':'Gyrus rectus',
 'OFCmed':'Orbitofrontal · medial','OFCant':'Orbitofrontal · anterior','OFCpost':'Orbitofrontal · posterior','OFClat':'Orbitofrontal · lateral',
 'Cingulate_Mid':'Middle cingulate cortex','Cingulate_Post':'Posterior cingulate cortex',
 'ACC_sub':'Anterior cingulate · subgenual','ACC_pre':'Anterior cingulate · pregenual','ACC_sup':'Anterior cingulate · supracallosal',
 'ParaHippocampal':'Parahippocampal gyrus','Calcarine':'Calcarine cortex',
 'Occipital_Sup':'Superior occipital gyrus','Occipital_Mid':'Middle occipital gyrus','Occipital_Inf':'Inferior occipital gyrus',
 'Fusiform':'Fusiform gyrus','Postcentral':'Postcentral gyrus','Parietal_Sup':'Superior parietal lobule','Parietal_Inf':'Inferior parietal lobule',
 'SupraMarginal':'Supramarginal gyrus','Angular':'Angular gyrus','Paracentral_Lobule':'Paracentral lobule',
 'Heschl':'Heschl’s gyrus','Temporal_Sup':'Superior temporal gyrus','Temporal_Mid':'Middle temporal gyrus','Temporal_Inf':'Inferior temporal gyrus',
 'Temporal_Pole_Sup':'Superior temporal pole','Temporal_Pole_Mid':'Middle temporal pole',
 'Thal_AV':'Anterior ventral nucleus','Thal_LP':'Lateral posterior nucleus','Thal_VA':'Ventral anterior nucleus',
 'Thal_VL':'Ventral lateral nucleus','Thal_VPL':'Ventral posterolateral nucleus','Thal_IL':'Intralaminar nuclei',
 'Thal_Re':'Reuniens nucleus','Thal_MDm':'Mediodorsal · medial','Thal_MDl':'Mediodorsal · lateral',
 'Thal_LGN':'Lateral geniculate nucleus','Thal_MGN':'Medial geniculate nucleus',
 'Thal_PuI':'Pulvinar · inferior','Thal_PuM':'Pulvinar · medial','Thal_PuA':'Pulvinar · anterior','Thal_PuL':'Pulvinar · lateral',
 'Vent_Str':'Ventral striatum','VTA':'Ventral tegmental area','SN_pc':'Substantia nigra · pars compacta',
 'SN_pr':'Substantia nigra · pars reticulata','Red_N':'Red nucleus','LC':'Locus coeruleus','Raphe_D':'Dorsal raphe','Raphe_M':'Median raphe',
}

def hierarchy(name):
    base=name[:-2] if name.endswith(('_L','_R')) else name
    base=base.replace('Cerebellum_', 'Cerebelum_')
    title=NAMES.get(base,base.replace('_',' '))
    if base.startswith('Cerebelum_'):
        return 'Cerebellar '+base[10:].replace('_','–'), ['Cerebellum','Hemispheric lobules',base[10:].replace('_','–')]
    if base.startswith('Vermis_'):
        return 'Vermis '+base[7:].replace('_','–'), ['Cerebellum','Vermis',base[7:].replace('_','–')]
    if base.startswith('Thal_'):
        group='Pulvinar' if base.startswith('Thal_Pu') else 'Mediodorsal nuclei' if base.startswith('Thal_MD') else 'Other nuclei'
        return title,['Subcortical structures','Thalamus',group,title]
    group=next((g for g,items in GROUPS.items() if base in items.split()),None)
    if group is None: raise ValueError('Unmapped AAL region: '+name)
    top='Brainstem' if group=='Brainstem nuclei' else 'Subcortical structures' if group in ['Basal ganglia','Medial temporal structures'] else 'Cerebral cortex'
    path=[top,group]
    if base.startswith('Frontal_Inf_'):path.append('Inferior frontal gyrus')
    elif base.startswith('OFC'):path.append('Orbitofrontal cortex')
    elif base.startswith('ACC_'):path.append('Anterior cingulate cortex')
    elif base.startswith('SN_'):path.append('Substantia nigra')
    path.append(title)
    return title,path
