import * as path from 'node:path'
import { Scanner } from '@tailwindcss/oxide'
import { beforeAll, bench, describe } from 'vitest'
import { analyzeText } from '../src/core/analyze'
import { highlightGroups } from '../src/core/types'
import type { CandidateValidator } from '../src/core/validator'
import { TailwindProjectManager } from '../src/tailwind/project'

const scanner = new Scanner({ sources: [] })
let validator: CandidateValidator
const line = `<div className="hover:block dark:flex group-hover:grid data-[state=open]:block before:hidden [&>svg]:size-5 w-[317px] bg-(--brand-color)" />\n`
const options = { classAttributes: ['className'], classFunctions: [] }
const specializedOptions = {
  ...options,
  enabledGroups: new Set(highlightGroups.filter((group) => group !== 'nonTailwind')),
}
const timing = { time: 1200, iterations: 40, warmupTime: 200 }

beforeAll(async () => {
  const project = await new TailwindProjectManager().getProject(
    path.resolve('tests/fixtures/tailwind-v4/src/component.js'),
  )
  if (!project) {
    throw new Error('Tailwind v4 benchmark project did not load')
  }
  validator = project.validator
})

// Both modes analyze identical input with warmed project caches. Editor rendering,
// project loading, and debounce latency are outside these measurements.
for (const lineCount of [500, 1000, 5000]) {
  const document = line.repeat(lineCount)
  describe(`${lineCount.toLocaleString()} lines, same variant-heavy input`, () => {
    bench(
      'default styles',
      () => {
        analyzeText(document, options, scanner, validator)
      },
      timing,
    )
    bench(
      'specialized styles',
      () => {
        analyzeText(document, specializedOptions, scanner, validator)
      },
      timing,
    )
  })
}
