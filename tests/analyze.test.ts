import * as path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { Scanner } from '@tailwindcss/oxide'
import { analyzeText } from '../src/core/analyze'
import { highlightGroups } from '../src/core/types'
import type { CandidateValidator } from '../src/core/validator'
import { TailwindProjectManager } from '../src/tailwind/project'

const scanner = new Scanner({ sources: [] })
let validator: CandidateValidator

const options = {
  classAttributes: ['class', 'className'],
  classFunctions: ['clsx', 'cn', 'cva'],
}

beforeAll(async () => {
  const manager = new TailwindProjectManager()
  const project = await manager.getProject(
    path.resolve('tests/fixtures/tailwind-v4/src/component.js'),
  )
  if (!project) throw new Error('Tailwind v4 test project did not load')
  validator = project.validator
})

describe('analyzeText', () => {
  it('colors breakpoint and state variants while coloring only arbitrary brackets', () => {
    const text = `
      <button className={cn(
        "flex items-center gap-2 md:hover:bg-red-500/50",
        active && "w-[calc(100%-2rem)] rounded-xl",
      )} />
    `

    const spans = analyzeText(text, options, scanner, validator)
    const highlighted = spans.map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: 'flex', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'gap-2', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'md:', group: 'breakpoint' })
    expect(highlighted).toContainEqual({ value: 'hover:', group: 'variant' })
    expect(highlighted).toContainEqual({ value: 'bg-red-500/50', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'w-[calc(100%-2rem)]', group: 'utility' })
    expect(highlighted.filter(({ group }) => group === 'arbitrary')).toEqual([
      { value: '[', group: 'arbitrary' },
      { value: ']', group: 'arbitrary' },
    ])
    expect(highlighted).toContainEqual({ value: 'rounded-xl', group: 'utility' })
  })

  it('separates breakpoint variants from other variants', () => {
    const text = `<div className="@md:flex max-lg:hidden @[40rem]:grid supports-[display:grid]:block" />`
    const highlighted = analyzeText(text, options, scanner, validator).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: '@md:', group: 'breakpoint' })
    expect(highlighted).toContainEqual({ value: 'max-lg:', group: 'breakpoint' })
    expect(highlighted).toContainEqual({ value: '@[40rem]:', group: 'breakpoint' })
    expect(highlighted).toContainEqual({
      value: 'supports-[display:grid]:',
      group: 'variant',
    })
  })

  it('does not style custom classes or normal code identifiers', () => {
    const text = `<div className={condition ? "flex custom-card" : variableName} />`
    const values = analyzeText(text, options, scanner, validator).map((span) =>
      text.slice(span.start, span.end),
    )

    expect(values).toContain('flex')
    expect(values).not.toContain('custom-card')
    expect(values).not.toContain('condition')
    expect(values).not.toContain('variableName')
  })

  it('highlights unresolved variants when the underlying utility is valid', () => {
    const text = `<div className="active-true:bg-brand hover:active-true:w-[13px] hocus:bg-brand custom-card" />`
    const highlighted = analyzeText(text, options, scanner, validator).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({
      value: 'active-true:',
      group: 'unresolvedVariant',
    })
    expect(highlighted).toContainEqual({ value: 'hover:', group: 'variant' })
    expect(highlighted).toContainEqual({ value: 'bg-brand', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'w-[13px]', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'hocus:', group: 'variant' })
    expect(highlighted.some(({ value }) => value === 'custom-card')).toBe(false)
  })

  it('leaves unresolved-looking custom classes alone when the utility is not Tailwind', () => {
    const text = `<div className="active-true:custom-card custom-card" />`

    expect(analyzeText(text, options, scanner, validator)).toEqual([])
  })

  it('batches unresolved-variant probes into one extra validation call', () => {
    const calls: string[][] = []
    const batchingValidator: CandidateValidator = {
      getValidCandidates(candidates) {
        calls.push([...candidates])
        return new Set(
          candidates.filter(
            (candidate) =>
              candidate === 'bg-red-500' ||
              candidate === 'hover:bg-red-500' ||
              candidate === 'focus:bg-red-500',
          ),
        )
      },
      isBreakpointVariant: () => false,
      getPrefix: () => null,
    }
    const text = `<div className="missing:hover:bg-red-500 missing:focus:bg-red-500" />`

    analyzeText(text, options, scanner, batchingValidator)

    expect(calls).toHaveLength(2)
    expect(new Set(calls[1])).toEqual(
      new Set(['bg-red-500', 'missing:bg-red-500', 'hover:bg-red-500', 'focus:bg-red-500']),
    )
  })

  it('uses important styling for the entire class instead of variant or arbitrary colors', () => {
    const text = `<div className="hover:!mt-4 w-[13px]!" />`
    const highlighted = analyzeText(text, options, scanner, validator).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: '!mt-4', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'hover:!mt-4', group: 'important' })
    expect(highlighted).toContainEqual({ value: 'w-[13px]!', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'w-[13px]!', group: 'important' })
    expect(highlighted).not.toContainEqual({ value: 'hover:', group: 'variant' })
    expect(highlighted.some(({ group }) => group === 'arbitrary')).toBe(false)
  })

  it('colors brackets in arbitrary variants and values', () => {
    const text = `<div className="[&>svg]:w-[13px]" />`
    const highlighted = analyzeText(text, options, scanner, validator).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: '[&>svg]:', group: 'variant' })
    expect(highlighted.filter(({ group }) => group === 'arbitrary')).toEqual([
      { value: '[', group: 'arbitrary' },
      { value: ']', group: 'arbitrary' },
      { value: '[', group: 'arbitrary' },
      { value: ']', group: 'arbitrary' },
    ])
  })

  it('highlights slash modifiers without treating slashes inside arbitrary values as modifiers', () => {
    const text = `<div className="group-hover/item:bg-red-500/50 w-1/2 bg-[url(/x.svg)]" />`
    const highlighted = analyzeText(text, options, scanner, validator).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted.filter(({ group }) => group === 'modifier')).toEqual([
      { value: '/item', group: 'modifier' },
      { value: '/50', group: 'modifier' },
      { value: '/2', group: 'modifier' },
    ])
    expect(highlighted).not.toContainEqual({ value: '/x.svg', group: 'modifier' })
  })

  it('can opt into non-Tailwind class highlighting without styling expression identifiers', () => {
    const text = `<div className={condition ? "flex custom-card" : variableName} />`
    const highlighted = analyzeText(
      text,
      { ...options, enabledGroups: new Set(highlightGroups) },
      scanner,
      validator,
    ).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: 'custom-card', group: 'nonTailwind' })
    expect(highlighted.some(({ value }) => value === 'condition')).toBe(false)
    expect(highlighted.some(({ value }) => value === 'variableName')).toBe(false)
  })

  it('does not classify comparison string operands as non-Tailwind classes', () => {
    const text = `<div className={state === "custom-state" ? "flex custom-card" : "grid"} />`
    const highlighted = analyzeText(
      text,
      { ...options, enabledGroups: new Set(highlightGroups) },
      scanner,
      validator,
    ).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: 'custom-card', group: 'nonTailwind' })
    expect(highlighted.some(({ value }) => value === 'custom-state')).toBe(false)
  })

  it('respects enabled groups and reveals constituent styles when important is disabled', () => {
    const text = `<div className="hover:!mt-4 md:bg-red-500/50" />`
    const highlighted = analyzeText(
      text,
      { ...options, enabledGroups: new Set(['utility', 'variant', 'modifier']) },
      scanner,
      validator,
    ).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: 'hover:', group: 'variant' })
    expect(highlighted).toContainEqual({ value: '!mt-4', group: 'utility' })
    expect(highlighted).toContainEqual({ value: '/50', group: 'modifier' })
    expect(highlighted.some(({ group }) => group === 'breakpoint')).toBe(false)
    expect(highlighted.some(({ group }) => group === 'important')).toBe(false)
  })
})

it('maps compact-buffer positions back through Unicode source offsets', () => {
  const text = `const label = "😀"; <div className="flex p-4" />`
  const spans = analyzeText(text, options, scanner, validator)
  const highlighted = spans.map((span) => text.slice(span.start, span.end))

  expect(highlighted).toContain('flex')
  expect(highlighted).toContain('p-4')
})
