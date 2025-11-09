import { createExperiment } from '../ab/engine.js';

export const publishAbHook = async (organizationId: string, baseName: string, variants: string[]) => {
  if (!variants.length) {
    throw new Error('At least one variant is required for AB publish hook');
  }
  const experiment = await createExperiment({
    organizationId,
    name: `${baseName} publish AB`,
    variants: variants.map((name) => ({ name }))
  });
  return experiment;
};
