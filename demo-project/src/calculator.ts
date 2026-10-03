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
    // Return precise division result (floating point)
    return a / b;
  }

  power(base: number, exponent: number): number {
    // Throw if exponent is negative as per contract
    if (exponent < 0) {
      throw new Error("Exponent must be non-negative");
    }
    // 0^0 should be 1 (Math.pow handles this)
    return Math.pow(base, exponent);
  }

  factorial(n: number): number {
    if (n < 0) {
      throw new Error("Factorial not defined for negative numbers");
    }
    if (!Number.isInteger(n)) {
      throw new Error("Factorial requires a non-negative integer");
    }
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  isPrime(n: number): boolean {
    // Prime numbers are positive integers greater than 1
    if (!Number.isInteger(n) || n <= 1) {
      return false;
    }
    // Even numbers greater than 2 are not prime
    if (n > 2 && n % 2 === 0) {
      return false;
    }
    // Check odd divisors up to sqrt(n)
    for (let i = 3; i * i <= n; i += 2) {
      if (n % i === 0) {
        return false;
      }
    }
    return true;
  }
}
