import { env } from '../../utils/env.js';

export type HdrProfile = 'HDR10' | 'HLG' | 'BT.2020' | 'HDR10+';

export type HdrMetadata = {
  profile: HdrProfile;
  colorSpace: 'REC.709' | 'BT.2020';
  transfer: 'PQ' | 'HLG' | 'SMPTE170M';
  lut?: string;
  maxNits?: number;
};

const metadataMap: Record<HdrProfile, HdrMetadata> = {
  HDR10: { profile: 'HDR10', colorSpace: 'BT.2020', transfer: 'PQ', lut: 'hdr10.cube', maxNits: 1000 },
  HLG: { profile: 'HLG', colorSpace: 'BT.2020', transfer: 'HLG', lut: 'hlg.cube', maxNits: 600 },
  'BT.2020': { profile: 'BT.2020', colorSpace: 'BT.2020', transfer: 'PQ', lut: 'bt2020.cube', maxNits: 500 },
  'HDR10+': { profile: 'HDR10+', colorSpace: 'BT.2020', transfer: 'PQ', lut: 'hdr10plus.cube', maxNits: 4000 }
};

export const getHdrMetadata = (): HdrMetadata => {
  const profile = (env.COLOR_PIPELINE ?? 'hdr10').toUpperCase() as HdrProfile;
  return metadataMap[profile] ?? metadataMap.HDR10;
};

export const getHdrMetadataForProfile = (profile?: HdrProfile): HdrMetadata =>
  metadataMap[profile ?? getHdrMetadata().profile];

export const describeHdrPipeline = () => {
  const meta = getHdrMetadata();
  return {
    ...meta,
    description: `Applying ${meta.profile} @${meta.colorSpace} using ${meta.transfer}`
  };
};
