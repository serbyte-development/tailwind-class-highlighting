import type { Scanner as OxideScanner } from '@tailwindcss/oxide'

export type CandidateScanner = Pick<OxideScanner, 'getCandidatesWithPositions'>

let scanner: CandidateScanner | undefined
let scannerPromise: Promise<CandidateScanner> | undefined

export async function getCandidateScanner(): Promise<CandidateScanner> {
  if (scanner) {
    return scanner
  }

  scannerPromise ??= import('@tailwindcss/oxide')
    .then(({ Scanner }) => new Scanner({ sources: [] }))
    .catch((error) => {
      scannerPromise = undefined
      throw error
    })

  scanner = await scannerPromise
  scannerPromise = undefined
  return scanner
}
