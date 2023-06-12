import { RenewableProcess } from './RenewableProcess'

async function main() {
  new RenewableProcess({
    timeout: 5000,
    cmd: `npx ts-node ./pricerUpdater.ts`,
  })
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
