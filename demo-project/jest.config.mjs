export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/test/**/*.test.ts"],
  // The held-out suite lives under .highness and must never run as part of the
  // visible suite, or the agent would read its failures during the run.
  testPathIgnorePatterns: ["/node_modules/", "/\\.highness/"],
};