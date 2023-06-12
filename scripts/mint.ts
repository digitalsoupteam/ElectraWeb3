import { BUSD, USDT } from "../constants/addresses";
import ERC20Minter from "../test/utils/ERC20Minter";

async function main() {
  const tokens = [
    BUSD,
    USDT,
  ]
  const user = process.argv[2]
  if(!user) throw 'Empty user address!'

  for(const token of tokens) {
    const balance = await ERC20Minter.mint(token, user, 100000)
    console.log(`${token} ${balance}`)
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});