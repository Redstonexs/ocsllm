import type { CachedSolverAnswer } from "./solver"

export interface AnswerCache {
  get(key: string): CachedSolverAnswer | undefined
  set(key: string, value: CachedSolverAnswer): void
}

/** Map-backed answer cache; mutation is the purpose of this testable cache seam. */
export class InMemoryAnswerCache implements AnswerCache {
  private readonly entries = new Map<string, CachedSolverAnswer>()

  get(key: string): CachedSolverAnswer | undefined {
    return this.entries.get(key)
  }

  set(key: string, value: CachedSolverAnswer): void {
    this.entries.set(key, value)
  }
}
