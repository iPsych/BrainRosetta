import type { Region } from './types';
export type ColorMode='enhanced'|'original';
export function regionColor(region:Region,mode:ColorMode):string{
  return mode==='enhanced'?(region.enhancedColor||region.color):region.color;
}
