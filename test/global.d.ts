// Minimal ambient declarations for the two built-in node modules the test
// suite uses. Pulling in @types/node just for these would add a devDependency
// this project otherwise has no reason to carry.

declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void
}

declare module 'node:assert/strict' {
  interface Assert {
    ok(value: unknown, message?: string): asserts value
    equal(actual: unknown, expected: unknown, message?: string): void
    deepEqual(actual: unknown, expected: unknown, message?: string): void
    match(value: string, regexp: RegExp, message?: string): void
  }
  const assert: Assert
  export default assert
}
