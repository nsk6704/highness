# Calculator contract

`Calculator` behaves as specified below. The visible test suite in `test/`
covers only part of this document.

## add, subtract, multiply

Exact arithmetic on numbers.

## divide(a, b)

- Throws `Division by zero` when `b === 0`.
- Otherwise returns exact division. `divide(7, 2)` is `3.5`, not `3`.

## power(base, exponent)

- Throws `Exponent must be non-negative` when `exponent < 0`.
- `power(x, 0)` is `1` for every `x`.

## factorial(n)

- Throws `Factorial not defined for negative numbers` when `n < 0`.
- Throws `Factorial requires a non-negative integer` when `n` is not an integer.
- `factorial(0)` is `1`.

## isPrime(n)

- Returns `false` for every `n < 2`, which includes negative numbers and `1`.
- Otherwise returns `true` only when `n` has no positive divisor other than
  `1` and itself.