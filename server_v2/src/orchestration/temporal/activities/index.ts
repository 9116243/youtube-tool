import { uploadShot } from './upload.js';
import { asrShot } from './asr.js';
import { burnShot } from './burn.js';
import { publishShot } from './publish.js';
import { qcShot } from './qc.js';
import { ttsShot } from './tts.js';

export { asrShot, ttsShot, burnShot, qcShot, uploadShot, publishShot };

export const cpuActivities = { asrShot, ttsShot, qcShot, uploadShot, publishShot };
export const gpuActivities = { burnShot };
