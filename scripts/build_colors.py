"""Prepare deterministic display colors; never modify source colors or label grids.

Source-LUT atlases retain CIELAB hue while lightness/chroma are optimized against
face-touching parcels. Other atlases use a Glasbey-style categorical fallback.
Schaefer resolutions share one palette, optimized over both adjacency graphs.
"""
from pathlib import Path
import argparse, gzip, hashlib, json
import numpy as np
from skimage.color import rgb2lab, lab2rgb, deltaE_ciede2000 as _deltaE

def deltaE_ciede2000(a, b):
    return _deltaE(*np.broadcast_arrays(a, b), channel_axis=-1)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
SOURCE_FAMILIES = {'Schaefer', 'Julich-Brain', 'SUIT', 'Yeo'}

def rgb(hexes):
    return np.array([[int(h[i:i+2], 16)/255 for i in (1, 3, 5)] for h in hexes])

def lab(values):
    return rgb2lab(np.asarray(values).reshape(-1, 1, 3)).reshape(np.shape(values))

def hexes(values):
    return ['#' + ''.join(f'{c:02x}' for c in row) for row in np.rint(np.clip(values, 0, 1)*255).astype(int)]

def adjacency(atlas):
    raw = gzip.decompress((DATA / atlas['labels']).read_bytes())
    assert hashlib.sha256(raw).hexdigest() == atlas['sha256']
    v = np.frombuffer(raw, dtype='<u2').reshape(atlas['dims'], order='F')
    edges = []
    for axis in range(3):
        lo = [slice(None)]*3; hi = lo.copy()
        lo[axis] = slice(None, -1); hi[axis] = slice(1, None)
        a, b = v[tuple(lo)], v[tuple(hi)]
        mask = (a != b) & (a > 0) & (b > 0)
        edges.append(np.sort(np.stack([a[mask], b[mask]], axis=1), axis=1))
    return np.unique(np.concatenate(edges), axis=0)

def fallback_palette(size=32):
    # Farthest-point sampling in CIELAB, restricted for a white background.
    grid = np.array(np.meshgrid(*([np.linspace(0, 1, 24)]*3))).reshape(3, -1).T
    labs = lab(grid); chroma = np.linalg.norm(labs[:, 1:], axis=1)
    keep = (labs[:, 0] >= 35) & (labs[:, 0] <= 78) & (chroma >= 30) & (chroma <= 85)
    grid, labs = grid[keep], labs[keep]
    distance = np.sum((labs-lab(rgb(['#277a79']))[0])**2, axis=1)
    chosen = []
    for _ in range(size):
        i = int(np.argmax(distance)); chosen.append(grid[i])
        distance = np.minimum(distance, np.sum((labs-labs[i])**2, axis=1))
    return np.array(chosen)

def candidates(source, preserve_hue):
    if not preserve_hue:
        return np.repeat(fallback_palette()[None, :, :], len(source), axis=0)
    original = lab(rgb(source)); hue = np.arctan2(original[:, 2], original[:, 1])
    # Deliberately separated tones, not a smooth ramp through label IDs.
    tones = [(l, c) for l in (32, 44, 56, 68, 80) for c in (25, 45, 65, 85)]
    values = np.array([[[l, c*np.cos(h), c*np.sin(h)] for l, c in tones] for h in hue])
    # Gamut clipping is measured after quantizing the actual emitted sRGB colors.
    return np.rint(lab2rgb(values)*255)/255

def optimize(regions, edges, preserve_hue):
    ids = [r['id'] for r in regions]; index = {id:i for i,id in enumerate(ids)}
    edges = np.array([[index[int(a)], index[int(b)]] for a,b in edges], dtype=int).reshape(-1, 2)
    neighbors = [set() for _ in ids]
    for a,b in edges: neighbors[a].add(b); neighbors[b].add(a)
    source = [r['color'] for r in regions]
    choices = candidates(source, preserve_hue); labs = lab(choices)
    original = lab(rgb(source)); assigned = np.full(len(ids), -1, dtype=int)
    output = np.zeros((len(ids), 3)); remaining = set(range(len(ids)))
    def best(i, adjacent):
        if not adjacent:
            return int(np.argmin(deltaE_ciede2000(labs[i], original[i]))) if preserve_hue else i % choices.shape[1]
        distances = deltaE_ciede2000(labs[i, :, None, :], output[adjacent][None, :, :])
        minimum = distances.min(axis=1)
        # Worst-neighbor separation is primary; source similarity breaks ties.
        penalty = deltaE_ciede2000(labs[i], original[i]) if preserve_hue else np.arange(choices.shape[1])*.01
        return int(np.argmax(minimum - penalty*.001))
    while remaining:
        i = max(remaining, key=lambda i:(sum(assigned[j]>=0 for j in neighbors[i]), len(neighbors[i]), -ids[i]))
        assigned[i] = best(i, sorted(j for j in neighbors[i] if assigned[j]>=0))
        output[i] = labs[i, assigned[i]]; remaining.remove(i)
    # Deterministic local improvement: increase the worst incident contrast.
    for _ in range(8):
        changed = False
        for i in sorted(range(len(ids)), key=lambda i:(-len(neighbors[i]), ids[i])):
            if not neighbors[i]: continue
            adjacent = sorted(neighbors[i]); j = best(i, adjacent)
            before = deltaE_ciede2000(output[i], output[adjacent]).min()
            after = deltaE_ciede2000(labs[i,j], output[adjacent]).min()
            if after > before + .01:
                assigned[i] = j; output[i] = labs[i,j]; changed = True
        if not changed: break
    colors = hexes(choices[np.arange(len(ids)), assigned])
    actual = lab(rgb(colors))
    before = deltaE_ciede2000(original[edges[:,0]], original[edges[:,1]])
    after = deltaE_ciede2000(actual[edges[:,0]], actual[edges[:,1]])
    def metrics(d):
        return dict(min=float(d.min()), median=float(np.median(d)), below5=int((d<5).sum()), below10=int((d<10).sum()), identical=int((d<1e-9).sum())) if len(d) else None
    if len(after): assert np.all(after > 0), 'Adjacent parcels must not share identical colors'
    return dict(zip(ids,colors)), dict(edges=len(edges), original=metrics(before), enhanced=metrics(after))

def main(only=None):
    catalog = json.loads((DATA/'catalog.json').read_text()); groups = {}
    for summary in catalog:
        a = json.loads((DATA/summary['manifest']).read_text())
        if only and not a['id'].startswith(only): continue
        groups.setdefault(a['meshes'], []).append(a)
    report = {'version':1, 'metric':'CIEDE2000 on quantized sRGB; not a perception guarantee under lighting or color-vision deficiency', 'adjacency':'face-touching nonzero native labels; union across shared-mesh resolutions', 'atlases':{}}
    for atlases in groups.values():
        reference = atlases[0]; preserve = reference['family'] in SOURCE_FAMILIES
        regions = sorted(reference['regions'], key=lambda r:r['id'])
        for a in atlases:
            assert [(r['id'],r['color']) for r in sorted(a['regions'],key=lambda r:r['id'])] == [(r['id'],r['color']) for r in regions]
        edges = np.unique(np.concatenate([adjacency(a) for a in atlases]), axis=0)
        colors, stats = optimize(regions, edges, preserve)
        for a in atlases:
            for r in a['regions']: r['enhancedColor'] = colors[r['id']]
            a['colorProvenance'] = 'source-lut' if preserve else 'generated-groups'
            a['enhancedColorMethod'] = 'neighbor-tone-v1' if preserve else 'neighbor-glasbey-v1'
            (DATA/a['id']/'manifest.json').write_text(json.dumps(a,ensure_ascii=False,separators=(',',':'))+'\n')
            report['atlases'][a['id']] = dict(**stats, method=a['enhancedColorMethod'], labelHash=a['sha256'])
        print(reference['id'], stats, flush=True)
    target = DATA/('color-validation.json' if not only else 'color-validation-preview.json')
    target.write_text(json.dumps(report,indent=2)+'\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--only'); args = parser.parse_args(); main(args.only)
