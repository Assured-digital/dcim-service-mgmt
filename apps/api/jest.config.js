/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: "\\.e2e-spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }]
  },
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  testEnvironment: "node",
  testTimeout: 30000
};
