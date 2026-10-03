import { Calculator } from "../src/calculator.js";

const calc = new Calculator();

describe("Calculator", () => {
  describe("add", () => {
    test("adds two positive numbers", () => {
      expect(calc.add(2, 3)).toBe(5);
    });

    test("adds negative numbers", () => {
      expect(calc.add(-2, -3)).toBe(-5);
    });

    test("adds positive and negative", () => {
      expect(calc.add(5, -3)).toBe(2);
    });
  });

  describe("subtract", () => {
    test("subtracts two numbers", () => {
      expect(calc.subtract(10, 4)).toBe(6);
    });

    test("subtracts resulting in negative", () => {
      expect(calc.subtract(3, 8)).toBe(-5);
    });
  });

  describe("multiply", () => {
    test("multiplies two numbers", () => {
      expect(calc.multiply(4, 5)).toBe(20);
    });

    test("multiplies by zero", () => {
      expect(calc.multiply(7, 0)).toBe(0);
    });
  });

  describe("divide", () => {
    test("divides two numbers", () => {
      expect(calc.divide(10, 2)).toBe(5);
    });

    test("divides with decimal result", () => {
      expect(calc.divide(7, 2)).toBe(3.5);
    });

    test("throws on division by zero", () => {
      expect(() => calc.divide(5, 0)).toThrow("Division by zero");
    });
  });

  describe("power", () => {
    test("raises to positive power", () => {
      expect(calc.power(2, 3)).toBe(8);
    });

    test("raises to power of 0", () => {
      expect(calc.power(5, 0)).toBe(1);
    });

    test("raises to power of 1", () => {
      expect(calc.power(7, 1)).toBe(7);
    });
  });

  describe("factorial", () => {
    test("factorial of 0", () => {
      expect(calc.factorial(0)).toBe(1);
    });

    test("factorial of 1", () => {
      expect(calc.factorial(1)).toBe(1);
    });

    test("factorial of 5", () => {
      expect(calc.factorial(5)).toBe(120);
    });

    test("throws on negative", () => {
      expect(() => calc.factorial(-1)).toThrow("Factorial not defined for negative numbers");
    });
  });
});