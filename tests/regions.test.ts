import { describe, expect, it } from 'vitest'
import { findClassTextRegions, findSourceRegions } from '../src/core/regions'

const options = {
  classAttributes: ['class', 'className', 'ngClass', '[ngClass]', 'class:list', ':class'],
  classFunctions: ['clsx', 'cn', 'cva', 'tw(?:\\.[A-Za-z_$][\\w$-]*)?'],
}

describe('findSourceRegions', () => {
  it('finds quoted and expression attributes', () => {
    const text = `<div class="flex p-4" ngClass="block" [ngClass]="{ hidden: active }" className={cn("grid", active && "gap-2")} />`
    const values = findSourceRegions(text, options).map((region) =>
      text.slice(region.start, region.end),
    )

    expect(values).toContain('flex p-4')
    expect(values).toContain('block')
    expect(values).toContain('{ hidden: active }')
    expect(values).toContain('cn("grid", active && "gap-2")')
    expect(values).toContain('"grid", active && "gap-2"')
  })

  it('finds cva calls and tagged templates', () => {
    const text = `const a = cva("flex", { variants: { size: { sm: "p-2" } } }); const b = tw.div\`grid gap-2\``
    const values = findSourceRegions(text, options).map((region) =>
      text.slice(region.start, region.end),
    )

    expect(values.some((value) => value.includes('"flex"'))).toBe(true)
    expect(values).toContain('grid gap-2')
  })

  it('does not treat dotted property assignments as class attributes', () => {
    const text = `node.className = "flex"; config.class = "grid"; <div className="block" />`
    const values = findSourceRegions(text, options).map((region) =>
      text.slice(region.start, region.end),
    )

    expect(values).toEqual(['block'])
  })
})

it('does not match attribute-name suffixes', () => {
  const text = `<div myclass="p-4" class="flex" />`
  const values = findSourceRegions(text, options).map((region) =>
    text.slice(region.start, region.end),
  )

  expect(values).toEqual(['flex'])
})

it('keeps tagged templates intact across interpolated templates', () => {
  const interpolation = '$' + '{active ? `bg-red-500` : "p-2"}'
  const text = `const styles = tw\`flex ${interpolation} grid\``
  const values = findSourceRegions(text, options).map((region) =>
    text.slice(region.start, region.end),
  )

  expect(values).toContain(`flex ${interpolation} grid`)
})

it('isolates literal class text from surrounding expression identifiers', () => {
  const text = `<div className={condition ? "flex custom-card" : variableName} />; const x = cn("grid", active && \`gap-2 \${size ? "p-4" : customVar}\`)`
  const sourceRegions = findSourceRegions(text, options)
  const values = findClassTextRegions(text, sourceRegions).map((region) =>
    text.slice(region.start, region.end),
  )

  expect(values).toContain('flex custom-card')
  expect(values).toContain('grid')
  expect(values).toContain('gap-2 ')
  expect(values).toContain('p-4')
  expect(values.some((value) => value.includes('condition'))).toBe(false)
  expect(values.some((value) => value.includes('variableName'))).toBe(false)
  expect(values.some((value) => value.includes('customVar'))).toBe(false)
})

it('treats quoted bound-class attributes as expressions and keeps only nested class strings', () => {
  const text = `<div :class="{ active: isActive, 'custom-card': enabled }" />`
  const sourceRegions = findSourceRegions(text, options)
  const values = findClassTextRegions(text, sourceRegions).map((region) =>
    text.slice(region.start, region.end),
  )

  expect(values).toEqual(['custom-card'])
})

it('does not treat comparison string operands as class text', () => {
  const text = `<div className={state === "custom-state" ? "flex custom-card" : "grid"} />`
  const sourceRegions = findSourceRegions(text, options)
  const values = findClassTextRegions(text, sourceRegions).map((region) =>
    text.slice(region.start, region.end),
  )

  expect(values).toContain('flex custom-card')
  expect(values).toContain('grid')
  expect(values).not.toContain('custom-state')
})
