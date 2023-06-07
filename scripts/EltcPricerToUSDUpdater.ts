import { ethers } from 'hardhat'
import { PricerToUSD__factory } from '../typechain-types';

async function main() {
  const poolingInterval = 1000;
  const eltcPricerAddress = '';
  const provider = new ethers.providers.JsonRpcProvider('');
  const owner = ethers.Wallet.createRandom({provider});
  const pricer = PricerToUSD__factory.connect(eltcPricerAddress, owner)

  setInterval(async () => {
    const currentPrice = ethers.utils.parseUnits('1', 8);
    const tx = await pricer.setCurrentPrice(currentPrice);
    const receipt = await tx.wait();
  }, poolingInterval)
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});