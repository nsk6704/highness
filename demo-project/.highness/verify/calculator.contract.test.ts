/**
 * Held-out verification. The agent has no read access to this directory.
 *
 * These cases cover the parts of SPEC.md that `test/` does not exercise, so
 * passing the visible suite is not sufficient evidence that the contract is
 * implemented.
 */
import { Calculator } from "../../src/calculator.js";

const calc = new Calculator();

describe("contract: divide", () => {
  test("divide by one returns the numerator", () => {
    expect(calc.divide(0, 5)).toBe(0);
  });

  test("keeps precision on thirds", () => {
    expect(calc.divide(1, 3)).toBeCloseTo(0.3333333333, 8);
  });

  test("keeps a negative fractional result", () => {
    expect(calc.divide(-7, 2)).toBe(-3.5);
  });
});

describe("contract: power", () => {
  test("rejects a negative exponent", () => {
    expect(() => calc.power(2, -1)).toThrow("Exponent must be non-negative");
  });

  test("zero to the power of zero is one", () => {
    expect(calc.power(0, 0)).toBe(1);
  });

  test("applies a larger exponent", () => {
    expect(calc.power(3, 5)).toBe(243);
  });
});

describe("contract: factorial", () => {
  test("rejects a fractional argument", () => {
    expect(() => calc.factorial(2.5)).toThrow("Factorial requires a non-negative integer");
  });

  test("computes a larger factorial", () => {
    expect(calc.factorial(10)).toBe(3628800);
  });
});

describe("contract: isPrime", () => {
  test("one is not prime", () => {
    expect(calc.isPrime(1)).toBe(false);
  });

  test("zero is not prime", () => {
    expect(calc.isPrime(0)).toBe(false);
  });

  test("negative numbers are not prime", () => {
    expect(calc.isPrime(-7)).toBe(false);
  });

  test("two is prime", () => {
    expect(calc.isPrime(2)).toBe(true);
  });

  test("an odd prime is prime", () => {
    expect(calc.isPrime(17)).toBe(true);
  });

  test("a larger prime is prime", () => {
    expect(calc.isPrime(97)).toBe(true);
  });

  test("a composite odd number is not prime", () => {
    expect(calc.isPrime(9)).toBe(false);
  });

  test("an even number above two is not prime", () => {
    expect(calc.isPrime(4)).toBe(false);
  });
});