#!/usr/bin/env node

const pathResolve = require('path').resolve

const cors = require('cors')
const express = require('express')
const glob = require('glob')
const nock = require('nock')
const proxy = require('http-proxy-middleware')
const yargs = require('yargs')

const { argv } = yargs.options({
  fixtures: {
    type: 'string',
    describe: 'Path glob for all test fixtures',
    default: pathResolve(__dirname, '..', 'scenarios/api.github.com/*/normalized-fixture.json')
  },
  loglevel: {
    type: 'string',
    describe: 'Set logging level for Express',
    default: 'debug'
  }
}).help()

const fixturePaths = glob.sync(argv.fixtures)
fixturePaths.forEach(mock => console.log(`Fixture found ${mock}`))

fixturePaths.map(nock.load).forEach((fixtureMocks) => {
  // by default, nock only allows each mocked route to be called once, afterwards
  // it returns a "No match for request" error. mock.persist() works around that
  fixtureMocks.forEach(mock => mock.persist())
})

const app = express()
app.use(cors())
app.use('/', proxy({
  target: 'https://api.github.com',
  changeOrigin: true,
  loglevel: argv.loglevel,
  onError (error, request, response) {
    response.writeHead(500, {
      'Content-Type': 'application/json; charset=utf-8'
    })

    if (error.message.indexOf('Nock: No match for request') !== 0) {
      return response.end(error.message)
    }

    const actualString = error.message
      .substr('Nock: No match for request '.length)
      .replace(/\s+Got instead(.|[\r\n])*$/, '')
    const errorRequestJson = JSON.parse(actualString)

    response.end(JSON.stringify({
      error: 'Nock: No match for request',
      request: errorRequestJson
    }, null, 2) + '\n')
  }
}))
app.listen(3000)
console.log('🌐  http://localhost:3000')
