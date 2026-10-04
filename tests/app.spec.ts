import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
