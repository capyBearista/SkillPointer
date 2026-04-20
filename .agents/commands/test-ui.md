# Run UI Tests

Run all OpenTUI unit tests for the TypeScript/React layer.

Steps:
1. Execute `node --import tsx --test opentui/src/core/**/*.test.ts`
2. Review the output for any failed assertions or coverage gaps
3. Ensure no OS mutations (file creation/deletion outside the test sandbox) occurred during the test run
4. Provide a summary of the test results

Remember to follow our testing and code quality standards in `opentui/AGENTS.md`.
