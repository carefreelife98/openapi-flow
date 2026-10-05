import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Metafile } from 'esbuild';

/** Preserve bundled dependencies' license notices in generated workflow code. */
export function bundledLicenseBanner(
  metadata: Metafile,
  generatedFrom: string[],
): string {
  const packages = new Set<string>(generatedFrom);
  const notices: string[] = [];
  for (const input of Object.keys(metadata.inputs)) {
    if (input === '<stdin>') continue;
    let directory = dirname(resolve(input));
    while (!existsSync(join(directory, 'package.json'))) {
      const parent = dirname(directory);
      if (parent === directory)
        throw new Error(`Bundled input ${input} has no owning package`);
      directory = parent;
    }
    packages.add(directory);
  }
  for (const directory of packages) {
    const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt']
      .map((name) => join(directory, name))
      .find(existsSync);
    if (!file)
      throw new Error(`Bundled package ${directory} has no license notice`);
    notices.push(readFileSync(file, 'utf8'));
  }
  return notices.length
    ? '/*! Bundled dependency licenses\n' +
        notices.join('\n\n').replaceAll('*/', '* /') +
        '\n*/\n'
    : '';
}
