export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error("Division by zero");
    }
    // BUG: Should be a / b, but we're returning a * b
    return a * b;
  }

  power(base: number, exponent: number): number {
    // BUG: Off-by-one error in loop
    let result = 1;
    for (let i = 0; i <= exponent; i++) {
      result *= base;
    }
    return result;
  }

  factorial(n: number): number {
    if (n < 0) {
      throw new Error("Factorial not defined for negative numbers");
    }
    if (n === 0 || n === 1) {
      return 1;
    }
    // BUG: Missing return statement
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    // Forgot to return result
  }
}