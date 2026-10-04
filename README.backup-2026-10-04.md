# BrainRosetta

A browser-only workspace for finding the same brain location across parcellations. White interface, Three.js glass brain, hierarchical region browser, and synchronized NiiVue MRI slices. No account, API key, uploads, database, or processing server.

## Run locally

Node.js 22 is recommended. Prepared atlas assets are included in `public/data`; Python is **not** required to run or deploy the app.

```sh
npm install --global=false
npm run dev --global=false
```

Open the URL printed by Vite. Production build:

```sh
npm run build --global=false
npm run preview --global=false
```

Serve over HTTP(S), rather than opening `index.html` as a local file. WebGL2 is required for the 3D and slice viewers. Atlas lookup runs separately in a Web Worker.

## Explore

- Choose an atlas family and variant. Switching atlases preserves the world coordinate and its reference-space provenance.
- Expand the anatomy/network tree. A checkbox controls visibility; a region name moves to a verified voxel inside that region. Search accepts names, IDs, and ancestor categories. `/` focuses search.
- Select a voxel in the MRI slices, click a 3D parcel, or enter MNI, Talairach, or native zero-based voxel coordinates.
- Pin up to eight comparison atlases. Different reference spaces require explicitly enabling approximate numeric-coordinate comparison.
- Adjust brain opacity, hemisphere visibility, camera orientation, or sagittal clipping. Collapse either side panel for a larger viewer.
- Export coordinate labels as CSV/JSON, the 3D view as PNG, or share the atlas/coordinate/selection/display state in a URL.
- Import up to 10,000 CSV/TSV coordinates. Batch results download locally. An already aligned NIfTI can replace the MRI background after declaring its reference space.

## Included atlases

79 selectable variants across 14 atlas families:

| Family | Packaged variants |
| --- | --- |
| AAL3 | 166 nonzero regions at 1 mm; original sparse label IDs preserved |
| Schaefer 2018 | 100–1,000 parcels in increments of 100; Yeo 7, Yeo 17, and Kong 2022 17-network ordering; native 1 and 2 mm grids (60 variants) |
| Julich-Brain | Version 3.1 hemisphere maps, combined with reversible ID remapping |
| Juelich (FSL) | Older histological atlas, 25% maximum-probability map and top-three source probabilities |
| Harvard–Oxford | Cortical and subcortical, 25% maximum-probability maps and top-three probabilities |
| Brainnetome | 246 regions |
| Tian | Four subcortical scales, 3 T |
| SUIT / Diedrichsen | Cerebellar anatomical atlas in its published MNI representation |
| Destrieux | Lateralized volumetric representation |
| AAL | Original 116-region SPM12 distribution |
| Desikan–Killiany | Neuroparc 70-label volume, including source white-matter entries |
| HCP-MMP / Glasser | 360-region volumetric projection |
| JHU | ICBM-DTI labels and tract maximum-probability map with top-three probabilities |
| Yeo 2011 | 7 and 17 networks, tight cortical mask |

“All Schaefer” here means the complete listed **MNI volumetric** resolutions and network orderings. Native cortical surface registrations and unrelated third-party derivatives are not bundled.

## Coordinate and anatomical interpretation

The label at a coordinate comes from the native integer voxel grid and its NIfTI affine. It is never guessed from the nearest region centroid or display surface. Empty label and outside-volume results remain distinct. The tree's navigation point is checked to lie inside its region; the reported centroid remains the arithmetic center.

MNIColin27, MNI152NLin6Asym, MNI152NLin2009cAsym, and Brainnetome's MNI-HCP40 reference are tracked separately. Approximate comparison reuses the numerical coordinate in another template; **it does not register templates**. Brainnetome uses an explicitly approximate MNI152 anatomical background. An aligned local background can replace it.

Talairach conversion uses the [BrainMap Lancaster pooled affine](https://www.brainmap.org/icbm2tal/) and its mathematical inverse. It is approximate and marked in the UI and exports. BrainRosetta does not provide nonlinear registration or native-subject normalization.

The AAL3 image is `AAL3v1_1mm.nii` from the April 2024 AAL3v2 distribution. All 166 voxel counts and centroids match the supplied `AAL3v1_region_locations_1mm.csv`. The hierarchy is BrainRosetta navigation curation, not an official AAL ontology. Other families retain their source names, with curated anatomy groups or published network assignments. Hierarchies are not equivalence mappings between atlases.

Julich 3.1 includes the source maximum-probability/gap maps; it does not contain the full probabilistic atlas. Its left labels retain original IDs; right IDs add 207, with `sourceId` retaining the original value. FSL probabilities are source percentages, not confidence scores inferred from deterministic labels.

HCP-MMP, Desikan, and Destrieux entries are volumetric derivatives, not the original subject-specific cortical surface parcellations. Display meshes are smoothed and decimated. Schaefer 1 mm entries reuse corresponding 2 mm display meshes while lookup uses the untouched 1 mm grid.

## GitHub Pages

The included `.github/workflows/pages.yml` builds and publishes `dist` on pushes to `main` or manual workflow dispatch. In the repository's **Settings → Pages**, select **GitHub Actions** as the source. Commit the prepared `public/data` assets with the application.

Vite uses relative asset paths, and view state lives in the URL fragment, so both `https://USER.github.io/BrainRosetta/` and root deployments work without rewrite rules. The site is approximately 160 MB, predominantly on-demand atlas assets. Users download only requested volumes/meshes, rather than the entire catalogue. There are no runtime external CDNs or remote coordinate services.

GitHub Pages still serves static files. “No backend” does not mean the first visit works without network access. A service-worker offline installation is not included.

## Validation

```sh
npm test --global=false
npm run check --global=false
# With the dev server running and Google Chrome installed:
npm run test:browser --global=false
# Optional production/subdirectory target:
BRAINROSETTA_URL=http://127.0.0.1:8767/BrainRosetta/ npm run test:browser --global=false
```

Unit tests cover affine inversion and sampling, sparse IDs, outside/empty voxels, Lancaster conversion, coordinate parsing, and hierarchy search. Chrome browser tests exercise actual atlas assets, tree focus, coordinate entry, exports, atlas switching, 1,000-region selection, URL restoration, batch import, mobile layout, and absence of external network requests. Safari and Firefox have not been verified in this build.

`scripts/validate_atlases.py` independently checks every packaged grid against its NIfTI, voxel hashes, affines, label IDs, voxel counts/volumes, every region's navigation point, mesh buffers, probability ranges, and the supplied AAL3 CSV. Its machine-readable report is `public/data/validation.json`.

## Rebuilding atlas assets (maintainers only)

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/download_atlases.py
.venv/bin/python scripts/build_atlases.py
.venv/bin/python scripts/build_templates.py
.venv/bin/python scripts/curate_metadata.py
.venv/bin/python scripts/validate_atlases.py
```

Sources are cached under `.cache/raw`. The downloader records source URLs and SHA256 checksums; Schaefer is pinned to a specific CBIG commit. Other upstream branches can change, so retain `source-receipts.json` when comparing rebuilds. The optional Nilearn cache is copied into the project or fetched when absent. Atlas downloads and preprocessing happen only on the maintainer's machine.

The builder skips an atlas when its manifest already exists. To regenerate changed geometry, remove only that generated atlas's folder first; regenerate Schaefer 2 mm meshes before their corresponding 1 mm entries. Run the full builder to recreate the complete catalogue. Run template preparation after atlas preparation, then metadata curation and validation. Python version and simplification differences can affect display meshes without changing voxel lookup.

## Architecture and prior work

- [AItlas Brain Explorer](https://aitlasbrainexplorer.com/) and [brainWhiz](https://rnorlund.github.io/brainWhiz/) informed the interaction direction. BrainRosetta concentrates on hierarchical atlas navigation and coordinate lookup/comparison.
- [Surfice](https://github.com/neurolabusc/surf-ice) uses native OpenGL/GLSL surface rendering; its [SurficeWeb](https://github.com/neurolabusc/SurficeWeb) counterpart uses Three.js and static hosting. BrainRosetta similarly uses Three.js for meshes, transparency, picking, and clipping.
- [MRIcroGL](https://github.com/rordenlab/MRIcroGL) is a native volume-rendering application. [NiiVue](https://github.com/niivue/niivue) supplies browser-native NIfTI slice rendering here. Desktop executable engines are not embedded.
- React/TypeScript own UI state; a dedicated worker decompresses assets, decodes meshes, and samples label/probability arrays. The worker holds at most five lookup volumes in an LRU cache.

## Attribution and source terms

Atlas datasets retain their own source terms; this repository does not relicense them. In particular, Julich-Brain's source distribution specifies **CC BY-NC-SA**. Bundled source notices are in `public/data/notices`. Each atlas manifest includes its source, citation, space, derivative notes, license description, and voxel checksum; these are also accessible from the app's information panel. Consult the linked upstream terms for uses beyond this browser explorer.

Core sources: [AAL/AAL3](https://www.gin.cnrs.fr/en/tools/aal/), [Schaefer/CBIG](https://github.com/ThomasYeoLab/CBIG/tree/master/stable_projects/brain_parcellation/Schaefer2018_LocalGlobal), [Julich NiiVue distribution](https://github.com/niivue/niivue-demo-images/tree/main/Juelich31), [FSL atlases](https://fsl.fmrib.ox.ac.uk/fsl/docs/other/datasets.html), [Brainnetome](https://github.com/brainnetome/bnatlasviewer), [Tian](https://github.com/yetianmed/subcortex), [cerebellar atlases](https://github.com/DiedrichsenLab/cerebellar_atlases), [Neuroparc](https://github.com/neurodata/neuroparc), [HCP volumetric projection](https://github.com/mbedini/The-HCP-MMP1.0-atlas-in-FSL), [Yeo](https://surfer.nmr.mgh.harvard.edu/fswiki/CorticalParcellation_Yeo2011).
