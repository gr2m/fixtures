const fixturizeCommitSha = require("../../lib/fixturize-commit-sha");

test("fixturizeCommitSha for fixturized sha", () => {
  const map = {
    existing: "0000000000000000000000000000000000000001",
  };
  const sha = fixturizeCommitSha(
    map,
    "0000000000000000000000000000000000000001"
  );
  expect(sha).toBe("0000000000000000000000000000000000000001");
});
