export type LicenseRecord = {
  provider: string;
  plan: string;
  watermark: boolean;
  redistributable: boolean;
  commercial_use: boolean;
  attribution: 'required' | 'optional' | 'none';
  tos_url: string;
};
