import { sync } from "glob";

import { bind } from "../../lib/normalize/index.js";

sync("scenarios/**/raw-fixture.json")
  .map((path) => path.replace(/(^scenarios\/|\/raw-fixture.json$)/g, ""))
  .forEach((fixturnName) => {
    test(`normalize ${fixturnName}`, async () => {
      const raw = require(`../../scenarios/${fixturnName}/raw-fixture.json`);
      const expected = require(`../../scenarios/${fixturnName}/normalized-fixture.json`);

      const scenarioState = {
        commitSha: {},
        ids: {},
      };
      const actual = await Promise.all(
        raw.filter(isntIgnored).map(bind(null, scenarioState))
      );
      expect(actual).toEqual(expected);
    });
  });

function isntIgnored(fixture) {
  return !fixture.reqheaders["x-octokit-fixture-ignore"];
}
