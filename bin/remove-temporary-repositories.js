#!/usr/bin/env node

import { create } from 'axios'

import { FIXTURES_USER_A_TOKEN_FULL_ACCESS } from '../lib/env'
import { regex } from '../lib/temporary-repository'

const github = create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `token ${FIXTURES_USER_A_TOKEN_FULL_ACCESS}`
  }
})

github.get('/orgs/octokit-fixture-org/repos')

  .then(result => {
    return Promise.all(result.data
      .map(repository => repository.name)
      .filter(name => regex.test(name))
      .map(name => {
        return github.delete(`/repos/octokit-fixture-org/${name}`)

          .then(() => {
            console.log(`✅  ${name} deleted`)
          })
      })
    )
  })

  .catch(console.log)
