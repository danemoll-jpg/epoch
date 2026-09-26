// Round 16b: `npm run test:rules` runs tests/firestore-rules.test.ts against the Firestore
// emulator. The emulator needs Java 21 or newer; this PC's system Java is 8, so a portable Java 21
// (Temurin JRE, unpacked without admin into %LOCALAPPDATA%\epoch-tools\) is put on PATH first
// when it's there. firebase-tools comes through npx (not a dependency: it's large and only this
// needs it).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const env = { ...process.env };
const tools = join(process.env.LOCALAPPDATA ?? '', 'epoch-tools');
const jre = existsSync(tools) ? readdirSync(tools).find((d) => /^jdk-2\d/.test(d)) : undefined;
if (jre) {
  env.JAVA_HOME = join(tools, jre);
  env.PATH = `${join(env.JAVA_HOME, 'bin')}${delimiter}${env.PATH}`;
  console.log(`test-rules: using ${env.JAVA_HOME}`);
}
// One command line (the shell would split the test command if it were passed as an argument).
const r = spawnSync('npx -y firebase-tools@15 emulators:exec --only firestore --project demo-epoch "npx vitest run tests/firestore-rules.test.ts"', {
  stdio: 'inherit',
  env,
  shell: true,
});
process.exit(r.status ?? 1);
