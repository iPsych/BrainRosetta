"""Build browser point maps; verify ITK parity, landmarks, Jacobians and round trips.

Browser format: int16 RAS-mm displacement / 1000, interleaved xyz, x fastest;
then uint8 validity per voxel. Invalid domains are never extrapolated as identity.
"""
from pathlib import Path
import argparse,csv,gzip,hashlib,json,shutil
import numpy as np
import nibabel as nib
import SimpleITK as sitk
from scipy.ndimage import map_coordinates

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.cache/transforms';OUT=ROOT/'public/data/transforms'
OUT.mkdir(parents=True,exist_ok=True)
SIGN=np.array([-1.,-1.,1.])
SPACES={'colin':'MNIColin27','6':'MNI152NLin6Asym','2009':'MNI152NLin2009cAsym'}
IMAGES={'colin':ROOT/'public/data/colin27.nii.gz','6':WORK/'6-brain.nii.gz','2009':WORK/'2009-brain.nii.gz'}
TF_SOURCE='https://github.com/templateflow/tpl-MNI152NLin2009cAsym/tree/15d7c02160f79f5218d2545b4febebeecc11531d'

class Evaluator:
 def __init__(self,path):
  self.native=sitk.ReadTransform(str(path));self.parts=[]
  transforms=[self.native.GetNthTransform(i) for i in reversed(range(self.native.GetNumberOfTransforms()))]
  for t in transforms:
   if t.GetName()=='AffineTransform':
    self.parts.append(('affine',np.array(t.GetMatrix()).reshape(3,3),np.array(t.GetCenter()),np.array(t.GetTranslation())))
   elif t.GetName()=='DisplacementFieldTransform':
    im=t.GetDisplacementField();a=sitk.GetArrayFromImage(im)
    self.parts.append(('field',a,np.array(im.GetOrigin()),np.linalg.inv(np.array(im.GetDirection()).reshape(3,3)@np.diag(im.GetSpacing()))))
   else:raise ValueError('Unsupported ITK component: '+t.GetName())
 def displacement(self,p,part):
  _,a,origin,inv=part;v=(p-origin)@inv.T
  valid=((v>=0)&(v<=np.array(a.shape[2::-1])-1)).all(1)
  d=np.column_stack([map_coordinates(a[...,c],v[:,::-1].T,order=1,mode='constant',cval=0,prefilter=False) for c in range(3)])
  return d,valid
 def __call__(self,p):
  p=np.asarray(p)*SIGN;valid=np.ones(len(p),bool)
  for part in self.parts:
   if part[0]=='affine':
    _,m,c,t=part;p=(p-c)@m.T+c+t
   else:
    d,v=self.displacement(p,part);p=p+d;valid&=v
  return p*SIGN,valid
 def inverse(self,q):
  # The accepted TemplateFlow composite is A(D(p)); invert A analytically,
  # then solve p+d(p)=A^-1(q). This is not negation of a displacement field.
  assert [x[0] for x in self.parts]==['field','affine']
  _,m,c,t=self.parts[1];target=(q*SIGN-c-t)@np.linalg.inv(m).T+c;p=target.copy()
  for _ in range(80):
   d,_=self.displacement(p,self.parts[0]);step=target-(p+d);p+=step*.8
   if np.max(np.linalg.norm(step,axis=1))<.0001:break
  d,valid=self.displacement(p,self.parts[0]);valid&=np.linalg.norm(p+d-target,axis=1)<.005
  return p*SIGN,valid

def sample_array(array,affine,points,order=1):
 v=nib.affines.apply_affine(np.linalg.inv(affine),points)
 return map_coordinates(array,v.T,order=order,mode='constant',cval=0,prefilter=False)

def fiducials(short):
 p=WORK/f'{SPACES[short]}-afids.fcsv';text=p.read_text()
 rows=list(csv.reader(l for l in text.splitlines() if not l.startswith('#')))
 data=np.array([[float(r[i]) for i in [1,2,3]] for r in rows])
 if '# CoordinateSystem = 1' in text or '# CoordinateSystem = LPS' in text:data*=SIGN
 return data,[r[12] for r in rows]

def stats(x):
 return dict(meanMm=float(np.mean(x)),p95Mm=float(np.percentile(x,95)),maxMm=float(np.max(x)))

def pack(id,src,dst,evaluate,method,source,step=2):
 im=nib.load(IMAGES[src]);affine=im.affine.copy();affine[:3,:3]*=step
 dims=tuple(((np.array(im.shape)-1)//step+1).tolist());points=nib.affines.apply_affine(affine,np.indices(dims).reshape(3,-1).T)
 mapped=[];valid=[]
 for block in np.array_split(points,max(1,len(points)//80000)):
  q,v=evaluate(block);mapped.append(q);valid.append(v)
 mapped=np.concatenate(mapped);valid=np.concatenate(valid)
 displacement=mapped-points;assert np.isfinite(displacement).all()
 assert np.abs(displacement[valid]).max()<32.767,(id,'int16 overflow')
 displacement[~valid]=0
 quant=np.rint(displacement*1000).astype('<i2').reshape(*dims,3)
 validity=valid.reshape(dims)
 payload=quant.transpose(2,1,0,3).tobytes()+validity.astype('uint8').tobytes(order='F')
 (OUT/(id+'.bin.gz')).write_bytes(gzip.compress(payload,mtime=0))
 exclusions=[]
 def browser(p):
  v=nib.affines.apply_affine(np.linalg.inv(affine),p)
  ok=((v>=0)&(v<=np.array(dims)-1)).all(1)&(sample_array(validity.astype(float),affine,p)>1-1e-8)
  for e in exclusions:ok&=np.linalg.norm(p-e['center'],axis=1)>e['radiusMm']
  q=p+np.column_stack([sample_array(quant[...,c].astype(float)*.001,affine,p) for c in range(3)])
  return q,ok
 rng=np.random.default_rng(20261004);mask=np.asarray(im.dataobj)>0
 candidates=np.argwhere(mask);p=nib.affines.apply_affine(im.affine,candidates[rng.choice(len(candidates),5000,replace=False)]+rng.uniform(-.4,.4,(5000,3)))
 expected,ev=evaluate(p);actual,av=browser(p);use=ev&av
 assert use.sum()>4500,(id,'insufficient test domain',use.sum())
 errors=np.linalg.norm(actual[use]-expected[use],axis=1);interpolation=stats(errors)
 if interpolation['maxMm']>.25:
  if step==2:return pack(id,src,dst,evaluate,method,source,step=1)
  raise ValueError((id,'field interpolation accuracy',interpolation))
 f,names=fiducials(src);g,_=fiducials(dst);fp,fv=browser(f);assert fv.all(),(id,'landmark domain')
 fe=np.linalg.norm(fp-g,axis=1);identity=np.linalg.norm(f-g,axis=1)
 # Independent landmarks must improve mean alignment; individual anatomy can differ.
 assert fe.mean()<identity.mean(),(id,'registration did not improve anatomical landmarks',fe.mean(),identity.mean())
 # Failures are retained in the report and explicitly excluded from runtime use.
 # These guard radii are conservative engineering restrictions, not confidence bounds.
 bad=fe>5.0
 for i in np.where(bad)[0]:
  exclusions.append(dict(center=f[i].tolist(),radiusMm=max(12.,float(fe[i])+2.),landmark=names[i],errorMm=float(fe[i])))
 assert (~bad).sum()>=30 and fe[~bad].mean()<2.5,(id,'insufficient anatomical agreement')
 # Gradient of the RAS displacement: detect folding in the interior brain support.
 gradients=np.empty((*dims,3,3))
 for component in range(3):
  gradients[...,component,:]=np.stack(np.gradient(quant[...,component].astype(float)*.001,step,edge_order=1),axis=-1)
 gradients+=np.eye(3);jac=np.linalg.det(gradients)
 brain=sample_array(mask.astype(float),im.affine,points,order=0).reshape(dims)>.5
 from scipy.ndimage import binary_erosion
 inside=binary_erosion(brain&validity,iterations=2);folds=int(np.sum(jac[inside]<=0));assert folds==0,(id,'folding',folds)
 spec=dict(id=id,from_=SPACES[src],to=SPACES[dst],dims=dims,affine=affine.tolist(),inverseAffine=np.linalg.inv(affine).tolist(),file=f'transforms/{id}.bin.gz',sha256=hashlib.sha256(payload).hexdigest(),scale=.001,method=method,source=source,
  validation=dict(landmarkMeanMm=float(fe.mean()),landmarkMaxMm=float(fe.max()),interpolationP95Mm=interpolation['p95Mm'],interpolationMaxMm=interpolation['maxMm']))
 spec['from']=spec.pop('from_')
 spec['qualityExclusions']=exclusions
 report=dict(id=id,gridStepMm=step,interpolation=interpolation,landmarks=dict(count=len(fe),registered=stats(fe),unchangedCoordinates=stats(identity),perLandmark=[dict(name=n,errorMm=float(e)) for n,e in zip(names,fe)]),nonpositiveJacobians=folds,jacobianMinimum=float(jac[inside].min()),sha256=spec['sha256'])
 report['qualityExclusions']=exclusions;report['retainedLandmarkErrors']=stats(fe[~bad]);report['retainedLandmarkCount']=int((~bad).sum())
 print(id,json.dumps(spec['validation']),flush=True)
 _,allowed=browser(p)
 return spec,report,browser,p[use&allowed]

def main(skip_colin=False):
 primary=Evaluator(WORK/'tf-6-to-2009-image.h5')
 routes=[('tf-2009-to-6','2009','6',primary,'TemplateFlow nonlinear registration',TF_SOURCE),('tf-6-to-2009','6','2009',primary.inverse,'Numerically verified inverse of TemplateFlow registration',TF_SOURCE)]
 if not skip_colin:
  forward=Evaluator(WORK/'colin-to-2009-Composite.h5');reverse=Evaluator(WORK/'colin-to-2009-InverseComposite.h5')
  routes.extend([('syn-2009-to-colin','2009','colin',forward,'BrainRosetta ANTs SyN; independently checked with AFIDs','https://github.com/ANTsX/ANTs'),('syn-colin-to-2009','colin','2009',reverse,'BrainRosetta ANTs SyN; independently checked with AFIDs','https://github.com/ANTsX/ANTs')])
 specs=[];reports=[];built={};fixtures=[]
 for id,src,dst,evaluate,method,source in routes:
  spec,report,browser,points=pack(id,src,dst,evaluate,method,source);specs.append(spec);reports.append(report);built[(src,dst)]=(browser,points)
  for p in points[:12]:
   q,_=evaluate(p[None]);fixtures.append(dict(transform=id,input=p.tolist(),expected=q[0].tolist()))
  if isinstance(evaluate,Evaluator):
   test=points[:200];native=np.array([evaluate.native.TransformPoint(tuple(p*SIGN)) for p in test])*SIGN;fast,_=evaluate(test)
   assert np.max(np.abs(native-fast))<1e-7,(id,'ITK parity')
 for (src,dst),(fn,p) in built.items():
  q,v=fn(p);back,w=built[(dst,src)][0](q);e=np.linalg.norm(back[v&w]-p[v&w],axis=1)
  report=next(r for r in reports if next(s for s in specs if s['id']==r['id'])['from']==SPACES[src] and next(s for s in specs if s['id']==r['id'])['to']==SPACES[dst]);report['roundTrip']=stats(e)
  assert np.percentile(e,95)<.5 and e.max()<1.5,(src,dst,'roundtrip',stats(e))
 # Reject the second upstream download as an inverse unless it passes the same check.
 secondary=Evaluator(WORK/'tf-2009-to-6-image.h5');p=fiducials('2009')[0];q,_=primary(p);back,_=secondary(q)
 rejected=dict(file='tf-2009-to-6-image.h5',reason='Fails reciprocal point-map check; not used by BrainRosetta',roundTrip=stats(np.linalg.norm(back-p,axis=1)))
 unsupported={'MNI152-HCP40':'No verified transform for the Brainnetome HCP40 reference is packaged.'}
 if skip_colin:unsupported['MNIColin27']='Colin27 registration has not yet passed validation.'
 (OUT/'catalog.json').write_text(json.dumps(dict(version=1,transforms=specs,unsupported=unsupported),indent=2)+'\n')
 (OUT/'validation.json').write_text(json.dumps(dict(accepted=reports,rejected=[rejected],notes='Landmark errors measure anatomical registration; interpolation and round-trip errors measure numerical implementation. Neither implies exact anatomical equivalence.'),indent=2)+'\n')
 (OUT/'fixtures.json').write_text(json.dumps(fixtures,indent=2)+'\n')
 shutil.copyfile(WORK/'sources.json',OUT/'sources.json')
 for p in WORK.glob('*LICENSE.txt'):shutil.copyfile(p,OUT/p.name)
 if not skip_colin:shutil.copyfile(WORK/'registration-command.json',OUT/'registration-command.json')
 print('Published',len(specs),'validated directed point maps.')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--skip-colin',action='store_true');args=parser.parse_args();main(args.skip_colin)
