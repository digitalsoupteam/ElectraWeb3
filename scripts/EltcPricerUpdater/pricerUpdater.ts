import { ethers } from 'ethers'
import { PricerToUSD__factory } from '../../typechain-types'
import { CONFIG } from './config'

// TODO: api service
async function fetchPrice() {
  return ethers.utils.parseUnits('1', 8)
}

export async function pricerUpdater() {
  const provider = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl)
  const owner = new ethers.Wallet(CONFIG.ownerPrivateKey, provider)
  const pricer = PricerToUSD__factory.connect(CONFIG.address, owner)

  setInterval(async () => {
    const currentPrice = await fetchPrice()
    const tx = await pricer.setCurrentPrice(currentPrice)
    const receipt = await tx.wait()
  }, CONFIG.updateInterval)
}
