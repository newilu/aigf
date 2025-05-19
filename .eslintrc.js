module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    sourceType: "module",
  },
  ignorePatterns: [
    "/utils/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  plugins: ["@typescript-eslint", "import", "prettier"],
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "import/no-unresolved": 0,
    "require-jsdoc": "off",
    quotes: "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
};
