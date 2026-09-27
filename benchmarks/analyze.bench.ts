import * as path from 'node:path'
import { beforeAll, bench, describe } from 'vitest'
import { Scanner } from '@tailwindcss/oxide'
import { analyzeText } from '../src/core/analyze'
import { highlightGroups } from '../src/core/types'
import type { CandidateValidator } from '../src/core/validator'
import { TailwindProjectManager } from '../src/tailwind/project'

const scanner = new Scanner({ sources: [] })
let validator: CandidateValidator
const line = `<div className={cn("flex items-center gap-2 md:hover:bg-red-500/50", active && "w-full rounded-lg shadow-sm")} />\n`
const unresolvedLine = `<div className={cn("flex items-center active-true:hover:bg-red-500/50", active && "w-full rounded-lg shadow-sm")} />\n`
const nonTailwindLine = `<div className={cn("flex items-center custom-card", active && "w-full project-shell")} />\n`
const options = {
  classAttributes: ['class', 'className'],
  classFunctions: ['clsx', 'cn', 'cva', 'twMerge'],
}
const nonTailwindOptions = { ...options, enabledGroups: new Set(highlightGroups) }

beforeAll(async () => {
  const manager = new TailwindProjectManager()
  const project = await manager.getProject(
    path.resolve('tests/fixtures/tailwind-v4/src/component.js'),
  )
  if (!project) throw new Error('Tailwind v4 benchmark project did not load')
  validator = project.validator
})

for (const lineCount of [500, 1000, 5000]) {
  const document = line.repeat(lineCount)
  describe(`${lineCount.toLocaleString()}-line TSX document`, () => {
    bench('scan + project validation', () => {
      analyzeText(document, options, scanner, validator)
    })

    const unresolvedDocument = unresolvedLine.repeat(lineCount)
    bench('scan + unresolved variant validation', () => {
      analyzeText(unresolvedDocument, options, scanner, validator)
    })

    const nonTailwindDocument = nonTailwindLine.repeat(lineCount)
    bench('scan + non-Tailwind classification', () => {
      analyzeText(nonTailwindDocument, nonTailwindOptions, scanner, validator)
    })
  })
}
