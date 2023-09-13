import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC20__factory, Treasury, Treasury__factory } from '../typechain-types'
import { CHAINLINK_LINK_USD, LINK, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'

const TEST_DATA = {
  tokens: [
    {
      address: USDT,
      pricer: 'UsdtPricer',
    },
  ],
}

describe(`Treasury`, () => {
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  let user2: SignerWithAddress
  let treasury: Treasury

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]
    user2 = accounts[8]

    await deployments.fixture()
    const TreasuryDeployment = await deployments.get('Treasury')
    treasury = Treasury__factory.connect(TreasuryDeployment.address, productOwner)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  for (const tokenData of TEST_DATA.tokens) {
    it(`Initial: ${tokenData.address} pricers`, async () => {
      const pricer = await treasury.pricers(tokenData.address)
      const pricerAddress = ethers.utils.isAddress(tokenData.pricer)
        ? tokenData.pricer
        : (await deployments.get(tokenData.pricer)).address
      assert(pricer == pricerAddress, `pricer != pricerAddress, ${pricer} != ${pricerAddress}`)
    })

    it(`Regular: owner withdraw`, async () => {
      const token = IERC20__factory.connect(tokenData.address, user)
      const amount = await ERC20Minter.mint(token.address, user.address, 10000)
      await token.connect(user).transfer(treasury.address, amount)
      const balanceBefore = await token.balanceOf(user2.address)
      await treasury.connect(productOwner).withdraw(token.address, amount, productOwner.address)
      const balanceAfter = await token.balanceOf(user2.address)
      assert(
        balanceAfter.sub(balanceBefore).eq(amount),
        `balanceAfter - balanceBefore != amount. ${balanceAfter} - ${balanceBefore} != ${amount}`,
      )
    })

    it(`Error: user update token`, async () => {
      const newTokenPricer = CHAINLINK_LINK_USD
      await expect(
        treasury.connect(user).updateTokenPricer(tokenData.address, newTokenPricer),
      ).to.be.revertedWith('only product owner!')
    })

    it(`Error: user delete token`, async () => {
      await expect(treasury.connect(user).deleteToken(tokenData.address)).to.be.revertedWith(
        'only product owner!',
      )
    })

    it(`Error: user withdraw`, async () => {
      const amount = 10
      await expect(
        treasury.connect(user).withdraw(tokenData.address, amount, user.address),
      ).to.be.revertedWith('Treasury: withdraw not authorized!')
    })
  }

  it(`Error: user add token`, async () => {
    const newToken = LINK
    const newTokenPricer = CHAINLINK_LINK_USD
    await expect(treasury.connect(user).addToken(newToken, newTokenPricer)).to.be.revertedWith(
      'only product owner!',
    )
  })

  it(`Error: user setOnlyProductOwnerWithdrawn`, async () => {
    await expect(treasury.connect(user).setOnlyProductOwnerWithdrawn(true)).to.be.revertedWith(
      'only product owner!',
    )
  })
})
