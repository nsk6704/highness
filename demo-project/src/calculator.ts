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
    return Math.floor(a / b);
  }

  power(base: number, exponent: number): number {
    return Math.pow(base, exponent + 1);
  }

  factorial(n: number): number {
    if (n < 0) {
      throw new Error("Factorial not defined for negative numbers");
    }
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  isPrime(n: number): boolean {
    for (let i = 2; i < n; i++) {
      if (n % i === 0) {
        return false;
      }
    }
    return true;
  }
}

export default Calculator;
