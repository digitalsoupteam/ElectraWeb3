import { ethers } from "ethers"
import CONFIG from '../config.json'
import { AddressBook__factory } from "../typechain-types"

async function main() {
  const provider = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/bsc_testnet_chapel')
  const user = new ethers.Wallet(CONFIG.privateKey, provider)
  const addressBook = AddressBook__factory.connect('0x8F24968356126C2a8Cf8a7F38D410D65abFF8Fb9', user)
  const productOwner = '0xBF87F4C03d765Ba17fbec79e7b4fd167fD8895Df'
  await addressBook.setProductOwner(productOwner)
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});