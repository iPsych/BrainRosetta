export type Vec3 = [number, number, number];
export type Matrix = number[][];
export type Hemisphere = 'L' | 'R' | 'M' | 'B';
export interface Region {
  id: number; name: string; original: string; abbreviation?: string;
  hemisphere: Hemisphere; path: string[]; color: string;
  centroid: Vec3; focus: Vec3; voxelCount: number; volume: number; sourceId?: number;
}
export interface AtlasSummary {
  id: string; family: string; name: string; variant: string; space: string;
  resolution: Vec3; regionCount: number; manifest: string;
}
export interface Atlas extends Omit<AtlasSummary, 'manifest'> {
  dims: Vec3; affine: Matrix; inverseAffine: Matrix; regions: Region[];
  labels: string; nifti: string; meshes: string; probabilities?: string;
  source: string; citation: string; license: string; notes: string; hierarchySource: string;
  sha256: string; probabilityNote?: string;
}
export interface Point { mm: Vec3; space: string; method: string }
export interface Lookup { id: number; voxel: Vec3; status: 'label' | 'unlabeled' | 'outside'; probabilities?: { id: number; value: number }[] }
export interface MeshData { id: number; positions: Float32Array; indices: Uint32Array }
export interface TreeNode { key: string; label: string; children: TreeNode[]; ids: number[]; region?: Region }
