# Template-to-template coordinate mapping

BrainRosetta applies packaged nonlinear **point** transforms in its Web Worker before sampling the destination atlas's native label volume. GitHub Pages serves static assets; registration preparation is performed offline. No user coordinates or MRI files are uploaded.

## Supported routes

| Route | Method | Coverage |
| --- | --- | --- |
| MNI2009c → FSL MNI152 | Published TemplateFlow composite, interpreted as a point mapping | Packaged field domain |
| FSL MNI152 → MNI2009c | Numerically computed inverse of that same composite | Converged inverse domain |
| MNI2009c ↔ Colin27 | BrainRosetta ANTs SyN registration of the exact templates, with independent landmark checks | Restricted domain; known poorly aligned ventricular neighborhoods excluded |
| Colin27 ↔ FSL MNI152 | Composition through MNI2009c | Intersection of the two applicable domains |
| Brainnetome MNI-HCP40 | No verified bridge established | Unsupported; explicit unchanged-coordinate approximation remains available |

These are research registrations with residual anatomical error. “Checked” describes the numerical and landmark tests below. It does not mean clinically validated, exact correspondence, or a guarantee at every voxel. The Colin27 registration is a new project derivative, not an independently published transform.

## Source selection and direction

The accepted published file is `tpl-MNI152NLin2009cAsym_from-MNI152NLin6Asym_mode-image_xfm.h5`, obtained from [TemplateFlow](https://github.com/templateflow/tpl-MNI152NLin2009cAsym/tree/15d7c02160f79f5218d2545b4febebeecc11531d). Its **image** direction is FSL → MNI2009c; its **point** direction is MNI2009c → FSL. ANTs explains this pull-mapping convention in its [transform documentation](https://github.com/ANTsX/ANTs/wiki/Forward-and-inverse-warps-for-warping-images,-pointsets-and-Jacobians).

The separately downloaded opposite-named TemplateFlow H5 did not behave as a reciprocal point transform in the checks. Its checksum and failed round-trip result are retained in the source/validation records; it is not used. BrainRosetta instead analytically inverts the affine and iteratively solves the displacement inverse of the accepted composite. Unconverged points are marked invalid.

ANTs/ITK uses LPS physical coordinates. Browser coordinates are RAS millimeters. Preparation explicitly converts x/y signs, composes transforms in the correct order, and exports RAS displacement fields. Tests compare these results with both SimpleITK and `antsApplyTransformsToPoints`.

## Measured quality

Independent anatomical checks use the 32 corresponding ground-truth AFIDs supplied by the [AFIDs project](https://afids.github.io/afids-protocol/), from its [Colin27](https://github.com/afids/tpl-MNIColin27), [MNI2009c](https://github.com/afids/tpl-MNI152NLin2009cAsym), and [FSL MNI152](https://github.com/afids/tpl-MNI152NLin6Asym) repositories. These landmarks were not used to fit the registration.

| Directed bridge | Mean error, all 32 landmarks | Maximum error, all 32 | Mean over retained landmarks |
| --- | ---: | ---: | ---: |
| MNI2009c → FSL | 0.77 mm | 1.71 mm | 0.77 mm (32) |
| FSL → MNI2009c | 0.78 mm | 1.69 mm | 0.78 mm (32) |
| MNI2009c → Colin27 | 2.66 mm | 18.59 mm | 1.75 mm (30) |
| Colin27 → MNI2009c | 2.58 mm | 18.27 mm | 1.70 mm (30) |

Unchanged coordinates average 1.27 mm error between the two MNI152 templates and 4.05 mm between Colin27 and MNI2009c. These values describe this particular landmark set, not whole-brain accuracy. Composed Colin27↔FSL routes can accumulate registration uncertainty.

**Colin27 restriction:** the right and left ventral occipital-horn landmarks retain large errors. Every landmark with error above 5 mm creates an excluded sphere in that point transform's source space, with radius `max(12 mm, measured error + 2 mm)`. These conservative engineering guards prevent use near known failures; they are not statistically calibrated confidence regions. The maximum error among the other 30 landmarks is 3.32 mm. The full 32-point errors remain in the report; no failed observation is removed from the reported overall results. The 5 mm threshold and radius policy were chosen during evaluation of this registration, so this is restricted-domain quality control, not a preregistered independent validation study.

Browser interpolation error against the native reference is below 0.25 mm for the 5,000 tested brain locations per field. The largest observed numerical round-trip error is below 0.13 mm over the tested supported domain. Native ANTs CLI comparisons agree within 0.00008 mm. No nonpositive Jacobians were detected in the eroded brain support. None of these numerical checks substitutes for anatomical validation.

The Colin27 global image correlation improves from 0.603 to 0.846 after registration. The [quality-control image](../public/data/transforms/registration-quality.png) illustrates alignment, while the landmark checks expose localized errors that global correlation can miss.

Machine-readable reports and source hashes:

- [Validation, exclusions, and ANTs provenance](../public/data/transforms/validation.json)
- [Directed transform catalogue](../public/data/transforms/catalog.json)
- [Downloaded source receipts](../public/data/transforms/sources.json)
- [Registration command](../public/data/transforms/registration-command.json)

## Runtime behavior

The original input coordinate and its template remain immutable when switching atlases. Each destination is computed from that original, rather than repeatedly transforming an already transformed point. The 3D crosshair, MRI slices, coordinate inputs, native voxel lookup, comparison cards, and batch exports use the destination coordinate. Selecting a new region, clicking a slice/parcel, or submitting manual coordinates establishes a new input in the active atlas's space.

Fields are downloaded on demand, decompressed and checked by SHA256 in the worker. The encoded format is interleaved int16 RAS displacement at 0.001 mm units, x-fastest storage, followed by one validity byte per grid point. Trilinear interpolation applies to displacement only. Atlas labels continue to use nearest-neighbor native-grid sampling. The two TemplateFlow fields use 2 mm sampling; the Colin27 fields use 1 mm sampling to satisfy the interpolation check. Compressed transform assets total approximately 85 MiB.

An unavailable route is distinguished from an invalid coordinate, out-of-domain mapping, or failed/checksum-mismatched download. The optional unchanged-coordinate fallback is available only when no route exists. It never overrides registration failures or exclusions.

A successful coordinate transform does not guarantee a destination label. For example, JHU white-matter coordinates can map successfully into MNI2009c while remaining outside HCP-MMP's cortical labels. The interface reports successful mapping separately from an unlabeled destination; it does not substitute a nearby cortical parcel.

Exports include original and destination coordinates, template names, mapping status, ordered transform IDs, field checksums, and atlas provenance. `mappingStatus=registered` means a nonlinear map was applied. `approximate` marks unchanged-template-coordinate fallback or Talairach conversion; its being false does not imply zero anatomical registration error. Talairach remains the separate approximate Lancaster affine conversion.

The FSL anatomical display background and shell now use the explicitly identified TemplateFlow `MNI152NLin6Asym` brain. The earlier generically named NiiVue `mni152` image was not suitable as provenance for that space.

## Maintainer preparation

The existing atlas preparation remains separate. Transform preparation requires the Python packages in `scripts/requirements.txt`, plus ANTs executables on PATH. The current Colin27 registration was generated with ANTs 2.2.0, 8 threads, and seed 20261004. Environment and version changes can alter a newly estimated registration; rerun every check before accepting replacements.

Run, in order: `scripts/download_transforms.py`, `scripts/register_colin.py`, `scripts/build_transforms.py`, and `scripts/check_transform_reference.py`. The builder records full landmark failures and enforces numerical, topology, and retained-landmark gates. All source files and intermediate registrations remain under `.cache/transforms`; the browser requires only the prepared `public/data/transforms` assets. Do not publish the builder's temporary `--skip-colin` output as the full release.

Source notices remain with the data. The project's own license does not replace TemplateFlow, template-image, AFIDs, or other third-party terms.
