import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'server_v2', 'workspace', 'dev-fixtures');

const fixtures = {
  tasks: [
    { id: 'selftest-video', kind: 'burn', status: 'queued' },
    { id: 'selftest-gen', kind: 'gen_video', status: 'queued' },
    { id: 'selftest-effect', kind: 'gen_effect', status: 'queued' }
  ]
};

const run = async () => {
  await writeFile(join(outputDir, 'fixtures.json'), JSON.stringify(fixtures, null, 2), 'utf8');
  console.log('Dev fixtures written to', outputDir);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
