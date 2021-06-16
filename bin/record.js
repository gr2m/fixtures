#!/usr/bin/env node

// run with "DEBUG=axios" to see debug logs
import axiosDebugLog from "axios-debug-log";
axiosDebugLog({
  request: function (debug, config) {
    debug(`${config.method.toUpperCase()} ${config.url}`);
  },
  response: () => {},
  error: () => {},
});

import axios from "axios";
import Bottleneck from "bottleneck";
import chalk from "chalk";
import cloneDeep from "lodash/cloneDeep.js";
import { diff, diffString } from "json-diff";
import glob from "glob";
import humanize from "humanize-string";
import minimist from "minimist";

import normalize from "../lib/normalize/index.js";
import read from "../lib/read.js";
import recordScenario from "../lib/record-scenario.js";
import write from "../lib/write.js";

const argv = minimist(process.argv.slice(2), {
  boolean: ["update", "test-cached"],
});
const doUpdate = argv.update;
const selectedScenarios = argv._;
const hasSelectedScenarios = selectedScenarios.length > 0;

console.log(`hasSelectedScenarios`);
console.log(hasSelectedScenarios);

const scenarios = hasSelectedScenarios
  ? selectedScenarios
  : glob.sync("scenarios/**/record.js");

console.log(`scenarios`);
console.log(scenarios);

async function runScenario(scenarioPath, diffs) {
  const fixtureName = scenarioPath.replace(/(^scenarios\/|\/record\.js$)/g, "");
  const [domain, title] = fixtureName.split("/");
  console.log("");
  console.log(
    `⏯️  ${chalk.bold(domain)}: ${humanize(title.replace(".js", ""))} ...`
  );

  const request = axios.create({
    baseURL: `https://${domain}`,
    maxRedirects: 0, // record redirects explicitly
  });

  // throttle writing requests
  // https://developer.github.com/v3/guides/best-practices-for-integrators/#dealing-with-abuse-rate-limits
  const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 3000,
  });
  request.interceptors.request.use((config) => {
    if (
      !["POST", "PATCH", "PUT", "DELETE"].includes(config.method.toUpperCase())
    ) {
      return config;
    }

    return limiter.schedule(async () => config);
  });

  // set strict validation header, remove once stricter validations are applied
  // to all requests: https://developer.github.com/changes/2018-11-07-strict-validation/
  request.interceptors.request.use((config) => {
    config.headers.Accept = `${config.headers.Accept},application/vnd.github.speedy-preview+json`;
    return config;
  });

  const oldNormalizedFixtures = await read(fixtureName);
  const newRawFixtures = await recordScenario({
    request: request,
    scenario: (await import(`../scenarios/${fixtureName}/record.js`)).default,
  });

  const scenarioState = {
    commitSha: {}, // map original commit sha hashes to normalized commit hashes
    ids: {},
  };

  const newNormalizedFixtures = await Promise.all(
    newRawFixtures
      .map(cloneDeep)
      .filter(hasntIgnoreHeader)
      .map(normalize.bind(null, scenarioState))
  );

  const fixturesDiffs = diff(newNormalizedFixtures, oldNormalizedFixtures);
  if (!fixturesDiffs) {
    console.log("✅  Fixtures are up-to-date");
    return;
  }

  diffs.push({
    name: fixtureName,
    changes: fixturesDiffs,
    newNormalizedFixtures,
    oldNormalizedFixtures,
    newRawFixtures,
  });

  if (fixturesDiffs[0][0] === "-") {
    if (doUpdate) {
      console.log("📼  New fixtures recorded");
      await write(fixtureName, {
        normalized: newNormalizedFixtures,
        raw: newRawFixtures,
      });
      return;
    }
    console.log(`❌  "${fixtureName}" looks like a new fixture`);
    return;
  }

  if (doUpdate) {
    console.log("📼  Fixture updates recorded");
    await write(fixtureName, {
      normalized: newNormalizedFixtures,
      raw: newRawFixtures,
    });
    return;
  }

  console.log("❌  Fixtures are not up-to-date");

  console.log(diffString(oldNormalizedFixtures, newNormalizedFixtures));
  console.log(
    `💁  Update fixtures with \`${chalk.bold("bin/record.js --update")}\``
  );
}

async function main() {
  // run scenarios one by one
  const diffs = [];
  for (const scenarioPath of scenarios) {
    try {
      await runScenario(scenarioPath, diffs);
    } catch (error) {
      console.error(`error while running scenario ${scenarioPath}`);
      if (!error.response) {
        console.log(error);
        process.exit(1);
      }

      console.log(error.toString());
      console.log("REQUEST");
      console.log(`${error.config.method.toUpperCase()} ${error.config.url}`);
      console.log("RESPONSE HEADERS");
      console.log(JSON.stringify(error.response.headers, null, 2));
      console.log("RESPONSE BODY");
      console.log(JSON.stringify(error.response.data, null, 2));
      process.exit(1);
    }
  }

  if (diffs.length === 0) {
    console.log("🤖  No fixture changes detected in cron job.");
    return;
  }

  if (doUpdate) {
    return;
  }

  console.log(`${diffs.length} fixtures are out of date. Exit 1`);
  process.exit(1);
}

main();

function hasntIgnoreHeader(fixture) {
  const hasIgnoreHeader = "x-octokit-fixture-ignore" in fixture.reqheaders;
  return !hasIgnoreHeader;
}
