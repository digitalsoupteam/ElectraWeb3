import { time } from "@nomicfoundation/hardhat-network-helpers";

async function main() {
  console.log( process.argv)
  const daysCount = Number(process.argv[2])
  if(!Number.isInteger(daysCount)) throw 'daysCount not int!'
  time.increase(daysCount * 24 * 60 * 60);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});