#!/usr/bin/env node
// Fails when the next version is already on npm, or was unpublished less than 24h ago.
const https = require('https')
const { name, version } = require('./package.json')

const type = process.argv[2] || 'patch'
const p = version.split('.').map(Number)
if (type === 'major') p.splice(0, 3, p[0] + 1, 0, 0)
else if (type === 'minor') p.splice(1, 2, p[1] + 1, 0)
else p[2]++
const next = p.join('.')

https
  .get(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, { headers: { Accept: 'application/json' } }, (res) => {
    let data = ''
    res.on('data', (c) => (data += c))
    res.on('end', () => {
      const pkg = JSON.parse(data)
      if (pkg.versions?.[next]) return fail(`${name}@${next} is already on npm`)
      const hours = pkg.time?.[next] ? (Date.now() - new Date(pkg.time[next])) / 36e5 : 24
      if (hours < 24) return fail(`${name}@${next} was unpublished ${hours.toFixed(1)}h ago: npm wants 24h`)
      console.log(`${name}@${next} can be published`)
    })
  })
  .on('error', (e) => fail(`npm registry: ${e.message}`))

function fail(msg) {
  console.error(msg)
  process.exit(1)
}
