/**
 * The relaxed YAML dialect as a source format. See relaxed-yaml.ts for the
 * dialect itself and lint.ts for what the editor underlines in it.
 */

import type { SourceFormat } from '@vibe-resume/core/format'
import { lintCv } from './lint'
import { parse } from './relaxed-yaml'
import template from './template.yaml?raw'

export const yaml: SourceFormat = {
  id: 'yaml',
  label: 'YAML',
  extensions: ['.yaml', '.yml'],
  mime: 'application/yaml',
  template,
  read: parse,
  lint: lintCv,
}
