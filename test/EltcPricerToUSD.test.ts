import { deployments, ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { PricerToUSD, PricerToUSD__factory } from '../typechain-types'

describe(`EltcPricerToUSD`, () => {
  let eltcPricerToUSD: PricerToUSD
  let initSnapshot: string
  let owner: SignerWithAddress

  before(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]

    await deployments.fixture(['EltcPricerToUSD'])
    const EltcPricerToUSDDeployment = await deployments.get('EltcPricerToUSD')

    eltcPricerToUSD = PricerToUSD__factory.connect(EltcPricerToUSDDeployment.address, owner)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it('Regular unit', async () => {
    const tx = await eltcPricerToUSD.setCurrentPrice(ethers.utils.parseUnits('1', 8))
    const receipt = await tx.wait()
  })
})
