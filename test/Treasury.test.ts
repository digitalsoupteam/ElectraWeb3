import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  Governance,
  Governance__factory,
  IERC20Metadata,
  IERC20Metadata__factory,
  IPricer__factory,
  IRewardsStrategy,
  IRewardsStrategy__factory,
  ITreasury__factory,
  ItemsFactory,
  ItemsFactory__factory,
  PricerToUSD,
  PricerToUSD__factory,
  StakingPlatform,
  StakingPlatform__factory,
  Treasury,
  Treasury__factory,
} from '../typechain-types'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import {
  getCurrentRound,
  getTimestamp,
  setTimeToNextMonday,
  stakeItems,
  tokenBalance,
  tokenDecimals,
  tokenTransfer,
} from './StakingPlatform.utils'
import {
  BNB_PLACEHOLDER,
  BUSD,
  CHAINLINK_BNB_USD,
  CHAINLINK_BUSD_USD,
  CHAINLINK_LINK_USD,
  CHAINLINK_USDT_USD,
  LINK,
  USDT,
} from '../constants/addresses'
import { BigNumber } from 'ethers'
import { pricerUpdater } from '../scripts/EltcPricerUpdater/pricerUpdater'
import ERC20Minter from './utils/ERC20Minter'
import { INITIAL_DATA } from './data/initialData'

describe(`Treasury`, () => {
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  let treasury: Treasury
  let tokens: IERC20Metadata[]

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture([ 'Treasury'])
    const TreasuryDeployment = await deployments.get('Treasury')

    treasury = Treasury__factory.connect(TreasuryDeployment.address, productOwner)

    tokens = (await treasury.tokens()).map(address =>
      IERC20Metadata__factory.connect(address, productOwner),
    )

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it('Initial data test: tokens', async () => {
    assert(
      tokens.length == INITIAL_DATA.tokens.length,
      `tokens.length != INITIAL_DATA.tokens.length. ${tokens.length} != ${INITIAL_DATA.tokens.length}`,
    )

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      assert(
        token.address == INITIAL_DATA.tokens[i].address,
        `token.address != INITIAL_DATA.tokens[i].address. ${token.address} != ${INITIAL_DATA.tokens[i].address}`,
      )
      const pricer = await treasury.pricers(token.address)
      assert(
        pricer == INITIAL_DATA.tokens[i].pricer,
        `pricer != INITIAL_DATA.tokens[i].pricer. ${pricer} != ${INITIAL_DATA.tokens[i].pricer}`,
      )
    }
  })

  it(`Error unit: add token not governance.`, async () => {
    const newToken = LINK
    const newTokenPricer = CHAINLINK_LINK_USD
    await expect(
      treasury.connect(user).setTokenPricer(newToken, newTokenPricer),
    ).to.be.revertedWith('GovernanceRole: not authorized!')
  })

  it(`Error unit: withdraw not governance.`, async () => {
    const token = INITIAL_DATA.tokens[0].address
    const amount = 1
    await expect(
      treasury.connect(user).withdraw(token, amount, user.address),
    ).to.be.revertedWith('Treasury: withdraw not authorized!')
  })

  it(`Error unit: setOnlyGovernanceWithdraw not governance.`, async () => {
    await expect(
      treasury.connect(user).setOnlyGovernanceWithdrawn(true),
    ).to.be.revertedWith('GovernanceRole: not authorized!')
  })

  for (const token of INITIAL_DATA.tokens) {
    it(`Regular unit: Treasury usdAmountToToken. ${JSON.stringify(token)}`, async () => {
      const usdAmount = ethers.utils.parseUnits('1000', 18)
      const pricer = IPricer__factory.connect(token.pricer, user)
      const { answer: tokenPrice } = await pricer.latestRoundData()
      const tokenAmount = await treasury.usdAmountToToken(usdAmount, token.address)
      const decimals = await tokenDecimals(token.address)
      let calculatedAmount = usdAmount
        .mul(`${10 ** decimals}`)
        .mul(`${1e8}`)
        .div(tokenPrice)
        .div(`${1e18}`)
      assert(
        tokenAmount.eq(calculatedAmount),
        `tokenAmount != calculatedAmount. ${tokenAmount} != ${calculatedAmount}`,
      )
    })

    it(`Regular unit: Treasury deposit. ${JSON.stringify(token)}`, async () => {
      const amount = await ERC20Minter.mint(token.address, user.address, 1000)
      const treasuryBalanceBefore = await tokenBalance(treasury.address, token.address)
      await tokenTransfer(token.address, amount, user, treasury.address)
      const treasuryBalanceAfter = await tokenBalance(treasury.address, token.address)
      assert(
        treasuryBalanceAfter.sub(amount).eq(treasuryBalanceBefore),
        `treasuryBalanceAfter - amount != treasuryBalanceBefore. ${treasuryBalanceAfter} + ${amount} != ${treasuryBalanceBefore}`,
      )
    })
  }
})
