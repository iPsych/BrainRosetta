import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as nifti from 'nifti-reader-js';

test('real atlas lookup, tree selection, transforms, export and atlas switching',async({page,baseURL})=>{
  const errors:string[]=[];const external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const appOrigin=new URL(baseURL!).origin;
  page.on('request',r=>{if(r.url().startsWith('http')&&new URL(r.url()).origin!==appOrigin)external.push(r.url());});
  await page.goto('./');
  await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await expect(page.locator('.region-detail')).toContainText('52, 118, 122');
  await expect(page.locator('.canvas-loading')).toHaveCount(0);
  await expect(page.locator('.canvas-error')).toHaveCount(0);
  await expect(page.locator('.slice-status')).toHaveCount(0);
  await page.getByLabel('Search regions').fill('Thal_AV');
  await page.locator('[data-region="121"] .region-name').click();
  await expect(page.locator('.region-original')).toHaveText('Thal_AV_L');
  await page.getByLabel('Search regions').fill('');
  await page.getByRole('button',{name:'Talairach',exact:true}).click();
  await page.getByRole('button',{name:'Locate in brain'}).click();
  await expect(page.locator('.viewer-coordinate')).toContainText('Approximate transform');
  await page.getByRole('button',{name:'Voxel',exact:true}).click();
  await page.getByLabel('Coordinate X').fill('-1');
  await page.getByRole('button',{name:'Locate in brain'}).click();
  await expect(page.locator('.inline-error')).toContainText('Voxel indices must be integers');
  await page.getByRole('button',{name:'MNI',exact:true}).click();
  for(const [axis,value] of [['X','999'],['Y','999'],['Z','999']])await page.getByLabel(`Coordinate ${axis}`).fill(value);
  await page.getByRole('button',{name:'Locate in brain'}).click();
  await expect(page.locator('.empty-point')).toContainText('Outside the atlas volume');
  for(const [axis,value] of [['X','-38'],['Y','-8'],['Z','50']])await page.getByLabel(`Coordinate ${axis}`).fill(value);
  await page.getByRole('button',{name:'Locate in brain'}).click();
  await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await page.getByLabel('Use unchanged coordinates when no transform is available').check();
  await expect(page.locator('.comparison-list')).not.toHaveClass(/updating/);
  await expect(page.locator('.comparison-card').first()).not.toContainText('Different reference template');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Coordinate results · CSV'}).click();
  const d=await downloadPromise;expect(d.suggestedFilename()).toBe('BrainRosetta-coordinate.csv');
  const csv=await readFile((await d.path())!,'utf8');expect(csv).toContain('Precentral_L');expect(csv).toContain('MNIColin27');expect(csv).toContain('atlasHash');
  await page.getByLabel('Close dialog').click();
  await page.getByLabel('Atlas family').selectOption('Schaefer');
  await page.getByLabel('Atlas variant').selectOption('schaefer-1000-17Networks-2mm');
  await expect(page.locator('.workspace-toolbar')).toContainText('1000 regions');
  await expect(page.locator('.canvas-loading')).toHaveCount(0);
  await expect(page.locator('.canvas-error')).toHaveCount(0);
  await expect(page.locator('.slice-status')).toHaveCount(0);
  await page.getByRole('button',{name:'Show all',exact:true}).click();
  await expect(page.locator('.tree-footer')).toContainText('1000 selected');
  await page.screenshot({path:'/private/tmp/brainrosetta-schaefer.png'});
  await page.getByLabel('Atlas family').selectOption('Julich-Brain');
  await expect(page.locator('.workspace-toolbar')).toContainText('Julich-Brain 3.1');
  await expect(page.locator('.canvas-loading')).toHaveCount(0);
  await expect(page.locator('.canvas-error')).toHaveCount(0);
  await expect(page.locator('.space-notice')).toContainText('Coordinate transformed successfully');
  await page.getByLabel('Use unchanged coordinates when no transform is available').uncheck();
  await expect(page.locator('.space-notice')).toContainText('Coordinate transformed successfully');
  const registered=await exportJson(page);expect(registered.results[0].mappingStatus).toBe('registered');
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('share URL restores state and narrow layout stays within viewport',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await page.getByLabel('Use unchanged coordinates when no transform is available').check();
  await page.getByRole('button',{name:'Share view'}).click();
  await expect(page).toHaveURL(/#view=/);
  await page.reload();await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await expect(page.getByLabel('Use unchanged coordinates when no transform is available')).toBeChecked();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByLabel('Search regions')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/private/tmp/brainrosetta-mobile.png',fullPage:true});
});

test('batch CSV is processed locally and downloaded',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-detail')).toContainText('52, 118, 122');
  await page.getByRole('button',{name:'Import',exact:true}).click();
  const promise=page.waitForEvent('download');
  await page.locator('input[accept=".csv,.tsv,.txt"]').setInputFiles({name:'points.csv',mimeType:'text/csv',buffer:Buffer.from('x,y,z\n-38,-8,50\n999,999,999')});
  const d=await promise;expect(d.suggestedFilename()).toBe('BrainRosetta-batch.csv');
  const csv=await readFile((await d.path())!,'utf8');expect(csv).toContain('Precentral_L');expect(csv).toContain('outside');expect(csv).toContain('registered');expect(csv).toContain('syn-colin-to-2009');
  await expect(page.getByRole('status')).toContainText('2 coordinates');
});

test('slice and 3D clicks update the coordinate with their provenance',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await expect(page.locator('.slice-status')).toHaveCount(0);
  await expect(page.locator('.canvas-loading')).toHaveCount(0);
  const slice=page.getByLabel('Axial, coronal, and sagittal MRI slices');
  const box=(await slice.boundingBox())!;
  await slice.click({position:{x:box.width*.32,y:box.height*.48}});
  await page.getByRole('button',{name:'Export',exact:true}).click();
  const first=page.waitForEvent('download');await page.getByRole('button',{name:'Results & selected regions · JSON'}).click();
  const s=JSON.parse(await readFile((await (await first).path())!,'utf8'));expect(s.point.method).toBe('MRI slice voxel');
  await page.getByLabel('Close dialog').click();
  const brain=page.locator('.canvas-host canvas'),b=(await brain.boundingBox())!;
  await brain.click({position:{x:b.width*.5,y:b.height*.48}});
  await page.getByRole('button',{name:'Export',exact:true}).click();
  const second=page.waitForEvent('download');await page.getByRole('button',{name:'Results & selected regions · JSON'}).click();
  const t=JSON.parse(await readFile((await (await second).path())!,'utf8'));expect(t.point.method).toContain('3D mesh point');
});

async function exportJson(page:import('@playwright/test').Page){
  await page.getByRole('button',{name:'Export',exact:true}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Results & selected regions · JSON'}).click();
  const json=JSON.parse(await readFile((await (await pending).path())!,'utf8'));
  await page.getByLabel('Close dialog').click();return json;
}

test('JHU white matter maps to HCP coordinates even when the cortical atlas has no label',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await page.getByLabel('Atlas family').selectOption('JHU');
  await expect(page.locator('.workspace-toolbar')).toContainText('JHU white matter');
  await page.getByLabel('Search regions').fill('Genu of corpus callosum');
  await page.locator('[data-region="3"] .region-name').click();
  await expect(page.locator('.region-detail')).toContainText('Genu of corpus callosum');
  const source=await exportJson(page);
  expect(source.point.mm).toEqual([0,26,8]);expect(source.results[0].status).toBe('label');
  await page.getByLabel('Atlas family').selectOption('HCP-MMP / Glasser');
  await expect(page.locator('.space-notice')).toContainText('Coordinate transformed successfully');
  await expect(page.locator('.empty-point')).toContainText('this atlas has no label at the mapped point');
  await expect(page.locator('.empty-point')).toContainText('HCP-MMP labels cortical regions');
  const mapped=await exportJson(page),row=mapped.results[0];
  expect(mapped.point).toEqual(source.point);expect(row.mappingStatus).toBe('registered');
  expect(row.status).toBe('unlabeled');expect(row.transformIds).toBe('tf-6-to-2009');
  expect([row.x,row.y,row.z]).not.toEqual(source.point.mm);
  await expect(page.getByLabel('Coordinate X')).toHaveValue(row.x.toFixed(1));
  await expect(page.locator('.canvas-error')).toHaveCount(0);
  await page.screenshot({path:'/private/tmp/brainrosetta-jhu-hcp.png'});
});

test('automatic registration drives displayed coordinates, export provenance and drift-free switching',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await page.getByLabel('Atlas family').selectOption('Schaefer');
  await expect(page.locator('.space-notice')).toContainText('Coordinate transformed successfully');
  const result=await exportJson(page),row=result.results[0];
  expect(result.point.mm).toEqual([-38,-8,50]);expect(result.point.space).toBe('MNIColin27');
  expect(row.mappingStatus).toBe('registered');expect(row.transformIds).toBe('syn-colin-to-2009 → tf-2009-to-6');
  expect(row.x).not.toBe(-38);expect(row.approximate).toBe(false);
  await expect(page.getByLabel('Coordinate X')).toHaveValue(row.x.toFixed(1));
  await expect(page.locator('.viewer-coordinate')).toContainText('MNI152NLin6Asym');
  await page.getByLabel('Atlas family').selectOption('Julich-Brain');await expect(page.locator('.space-notice')).toContainText('Coordinate transformed successfully');
  await page.getByLabel('Atlas family').selectOption('AAL3');
  await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await expect(page.getByLabel('Coordinate X')).toHaveValue('-38.0');
  await page.getByLabel('Atlas family').selectOption('Brainnetome');
  await expect(page.locator('.empty-point')).toContainText('No verified transform');
  const blocked=await exportJson(page);expect(blocked.results[0].mappingStatus).toBe('unsupported');expect(blocked.results[0].x).toBe('');
  await page.getByLabel('Use unchanged coordinates when no transform is available').check();
  const approximate=await exportJson(page);expect(approximate.results[0].mappingStatus).toBe('approximate');expect(approximate.results[0].x).toBe(-38);
});

test('known poor landmark neighborhoods cannot silently fall back to unchanged coordinates',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  for(const [axis,value] of [['X','27.4747875'],['Y','-63.9652125'],['Z','2.0995312825']])await page.getByLabel(`Coordinate ${axis}`).fill(value);
  await page.getByRole('button',{name:'Locate in brain'}).click();
  await page.getByLabel('Use unchanged coordinates when no transform is available').check();
  await page.getByLabel('Atlas family').selectOption('Schaefer');
  await expect(page.locator('.empty-point')).toContainText('excluded area');
  const result=await exportJson(page);expect(result.results[0].status).toBe('outside-transform');expect(result.results[0].x).toBe('');
});

test('parcel contrast stays stable, preserves original LUT colors and restores shared appearance',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await expect(page.getByLabel('Region colors')).toHaveValue('enhanced');
  await page.getByLabel('Atlas family').selectOption('Schaefer');
  await expect(page.getByLabel('Atlas variant')).toBeVisible();
  await page.getByLabel('Atlas variant').selectOption('schaefer-1000-7Networks-2mm');
  await expect(page.locator('.workspace-toolbar')).toContainText('1000 regions');
  await expect(page.locator('.canvas-loading')).toHaveCount(0);await expect(page.locator('.slice-status')).toHaveCount(0);
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByLabel('Search regions').fill('695');
  const a=page.locator('[data-region="695"]');await a.locator('input').check();
  const color=await a.locator('.region-color').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.getByLabel('Search regions').fill('696');
  const b=page.locator('[data-region="696"]');await b.locator('input').check();
  expect(await b.locator('.region-color').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(color);
  await page.getByLabel('Search regions').fill('695');
  await expect(a.locator('.region-color')).toHaveCSS('background-color',color);
  const enhanced=await exportJson(page);
  expect(enhanced.display.colorMode).toBe('enhanced');
  expect(enhanced.selectedRegions.find((r:{id:number})=>r.id===695).displayColor).not.toBe('#047609');
  await page.getByLabel('Search regions').fill('');
  await page.getByRole('button',{name:'Show all',exact:true}).click();
  await page.screenshot({path:'/private/tmp/brainrosetta-enhanced-colors.png'});
  await page.getByLabel('Region colors').selectOption('original');
  await page.getByLabel('Search regions').fill('695');
  await expect(a.locator('.region-color')).toHaveCSS('background-color','rgb(4, 118, 9)');
  const original=await exportJson(page);expect(original.point).toEqual(enhanced.point);
  expect(original.selectedRegions.find((r:{id:number})=>r.id===695).displayColor).toBe('#047609');
  await page.getByLabel('Search regions').fill('');
  await page.screenshot({path:'/private/tmp/brainrosetta-original-colors.png'});
  await page.getByLabel('Display settings').click();await page.getByLabel('Show parcel outlines').uncheck();await page.getByLabel('Close dialog').click();
  await page.getByRole('button',{name:'Share view'}).click();await expect(page).toHaveURL(/#view=/);await page.reload();
  await expect(page.getByLabel('Region colors')).toHaveValue('original');
  await page.getByLabel('Display settings').click();await expect(page.getByLabel('Show parcel outlines')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('AAL palettes bypass stale metadata and cannot inherit the legacy single-color mode',async({page})=>{
  const metadataRequests:string[]=[];
  page.on('request',r=>{if(r.url().includes('/manifest.json'))metadataRequests.push(r.url());});
  // Reproduce an old shared AAL3 view that explicitly chose Original colors.
  const view=new URLSearchParams({view:JSON.stringify({atlas:'aal3-1mm',colorMode:'original',selected:[1,2]})});
  await page.goto('./#'+view);
  await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await expect(page.getByLabel('Region colors')).toHaveValue('enhanced');
  await expect(page.getByLabel('Region colors').locator('option[value="original"]')).toHaveJSProperty('disabled',true);
  const left=page.locator('[data-region="1"] .region-color'),right=page.locator('[data-region="2"] .region-color');
  expect(await left.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(await right.evaluate(e=>getComputedStyle(e).backgroundColor));
  expect(metadataRequests.some(url=>/aal3-1mm\/manifest\.json\?v=[0-9a-f]{16}/.test(url))).toBe(true);
  await page.getByLabel('Atlas family').selectOption('Schaefer');await expect(page.getByLabel('Atlas variant')).toBeVisible();
  await page.getByLabel('Region colors').selectOption('original');
  await expect(page.getByLabel('Region colors')).toHaveValue('original');
  await page.getByLabel('Atlas family').selectOption('AAL');await expect(page.locator('.workspace-toolbar')).toContainText('116 regions');
  await expect(page.getByLabel('Region colors')).toHaveValue('enhanced');
  await page.getByLabel('Search regions').fill('Precentral');
  const a=page.locator('[data-region="2001"] .region-color'),b=page.locator('[data-region="2002"] .region-color');
  expect(await a.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(await b.evaluate(e=>getComputedStyle(e).backgroundColor));
  await expect(page.getByLabel('Region colors').locator('option[value="original"]')).toHaveJSProperty('disabled',true);
});

test('exports the checked regions as a native binary NIfTI mask',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await expect(page.getByLabel('ROI mask export')).toContainText('2 checked regions');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save ROI mask · .nii',exact:true}).click();
  const d=await pending;await d.saveAs('/private/tmp/brainrosetta-roi-native.nii');
  const bytes=await readFile((await d.path())!),buffer=Uint8Array.from(bytes).buffer,h=nifti.readHeader(buffer)!;
  expect(h.dims.slice(1,4)).toEqual([181,217,181]);expect(h.datatypeCode).toBe(2);
  const values=new Uint8Array(nifti.readImage(h,buffer));expect(new Set(values)).toEqual(new Set([0,1]));
  const atlas=JSON.parse(await readFile('public/data/aal3-1mm/manifest.json','utf8'));
  expect(values.reduce((a,b)=>a+b,0)).toBe(atlas.regions.filter((r:{id:number})=>[1,2].includes(r.id)).reduce((n:number,r:{voxelCount:number})=>n+r.voxelCount,0));
  const metadata=JSON.parse(new TextDecoder().decode(nifti.readExtensionData(h,buffer)).replace(/\0+$/,''));
  expect(metadata.targetSpace).toBe('MNIColin27');expect(metadata.interpolation).toBe('none (native grid)');
});

test('exports a JHU ROI into the MNI2009c grid using nonlinear pull resampling',async({page})=>{
  test.setTimeout(180000);
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await page.getByLabel('Atlas family').selectOption('JHU');await expect(page.locator('.workspace-toolbar')).toContainText('JHU white matter');
  await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByLabel('Search regions').fill('Genu of corpus callosum');
  await page.locator('[data-region="3"] .region-name').click();await expect(page.locator('.region-detail')).toContainText('Genu of corpus callosum');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByLabel('ROI output template').selectOption('MNI152NLin2009cAsym');
  const pending=page.waitForEvent('download',{timeout:150000});await page.getByRole('button',{name:'Save ROI mask · .nii',exact:true}).click();
  const d=await pending;await d.saveAs('/private/tmp/brainrosetta-roi-mni2009.nii');
  const buffer=Uint8Array.from(await readFile((await d.path())!)).buffer,h=nifti.readHeader(buffer)!;
  expect(h.dims.slice(1,4)).toEqual([193,229,193]);expect(h.affine).toEqual([[1,0,0,-96],[0,1,0,-132],[0,0,1,-78],[0,0,0,1]]);
  const metadata=JSON.parse(new TextDecoder().decode(nifti.readExtensionData(h,buffer)).replace(/\0+$/,''));
  expect(metadata.transforms.map((t:{id:string})=>t.id)).toEqual(['tf-2009-to-6']);
  expect(metadata.regions.map((r:{id:number})=>r.id)).toEqual([3]);expect(metadata.regions[0].outputVoxels).toBeGreaterThan(5000);
  expect(new Set(new Uint8Array(nifti.readImage(h,buffer)))).toEqual(new Set([0,1]));
  await expect(page.locator('.roi-saved')).toContainText('Saved');
  await page.screenshot({path:'/private/tmp/brainrosetta-roi-export.png'});
});

test('ROI cancellation leaves native labeled export available and unsupported templates disabled',async({page})=>{
  await page.goto('./');await expect(page.locator('.region-original')).toHaveText('Precentral_L');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByLabel('ROI output template').selectOption('MNI152NLin2009cAsym');
  await page.getByRole('button',{name:'Save ROI mask · .nii',exact:true}).click();
  await page.getByRole('button',{name:'Cancel ROI export',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save ROI mask · .nii',exact:true})).toBeEnabled();
  await page.getByLabel('ROI output template').selectOption('native');
  await page.getByLabel('ROI mask values').selectOption('labels');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save ROI mask · .nii',exact:true}).click();
  const d=await pending,buffer=Uint8Array.from(await readFile((await d.path())!)).buffer,h=nifti.readHeader(buffer)!;
  expect(h.datatypeCode).toBe(512);expect(new Set(new Uint16Array(nifti.readImage(h,buffer)))).toEqual(new Set([0,1,2]));
  await page.getByLabel('Close dialog').click();await page.getByLabel('Atlas family').selectOption('Brainnetome');
  await expect(page.locator('.workspace-toolbar')).toContainText('Brainnetome');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await expect(page.getByLabel('ROI output template').locator('option[value="MNI152NLin2009cAsym"]')).toHaveJSProperty('disabled',true);
  await expect(page.getByLabel('ROI output template')).toHaveValue('native');
});
