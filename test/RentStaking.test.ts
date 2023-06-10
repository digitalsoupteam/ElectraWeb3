import { deployments, ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC20Metadata__factory, RentStaking, RentStaking__factory } from '../typechain-types'
import { BNB_PLACEHOLDER, BUSD, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { BigNumber, ContractReceipt, ContractTransaction } from 'ethers'
import { assert, expect } from 'chai'
import { Test } from 'mocha'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'

const inputTokens = [BNB_PLACEHOLDER, BUSD, USDT]

const suite = describe(`RentStaking`, () => {
  let rentStaking: RentStaking

  let initSnapshot: string

  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress

  let supportedTokens: RentStaking.SupportedTokenStructOutput[]
  let itemsWithPrice: RentStaking.ItemStructOutput[]
  let lockPeriodsWithRewardsRates: RentStaking.LockPeriodStructOutput[]

  before(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    user1 = accounts[8]
    user2 = accounts[9]

    await deployments.fixture(['RentStaking'])
    const RentStakingDeployment = await deployments.get('RentStaking')

    rentStaking = RentStaking__factory.connect(RentStakingDeployment.address, owner)

    supportedTokens = await rentStaking.getSupportedTokensWithPricers()
    itemsWithPrice = await rentStaking.getItemsWithPrice()
    lockPeriodsWithRewardsRates = await rentStaking.getLockPeriodsWithRewardsRates()

    initSnapshot = await ethers.provider.send('evm_snapshot', [])

    // Dynamic tests
    registryDinamicTests()
  })

  afterEach(async () => {
    console.log('afterEach')
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  async function registryDinamicTests() {
    const allCases = generateAllCases()

    for (const data of allCases) {
      const { supportedToken, itemWithPrice, lockPeriodWithRewardsRate } = data
      suite.addTest(
        new Test(
          `Regular unit: token ${supportedToken.token} buy item ${itemWithPrice.name} with lock period ${lockPeriodWithRewardsRate.lockTime} `,
          async () => {
            await regularUnitTest_buyItem(supportedToken.token, itemWithPrice, lockPeriodWithRewardsRate)
          },
        ),
      )
    }

    for (const data of allCases) {
      const { supportedToken, itemWithPrice, lockPeriodWithRewardsRate } = data
      suite.addTest(
        new Test(
          `Error unit(not enough funds): token ${supportedToken.token} buy item ${itemWithPrice.name} with lock period ${lockPeriodWithRewardsRate.lockTime} `,
          async () => {
            await errorUnitTest_buyItem_notEnoughFunds(
              supportedToken.token,
              itemWithPrice,
              lockPeriodWithRewardsRate,
            )
          },
        ),
      )
    }
  }

  function generateAllCases(): Array<{
    supportedToken: RentStaking.SupportedTokenStructOutput
    itemWithPrice: RentStaking.ItemStructOutput
    lockPeriodWithRewardsRate: RentStaking.LockPeriodStructOutput
  }> {
    const data = []
    for (const supportedToken of supportedTokens) {
      for (const itemWithPrice of itemsWithPrice) {
        for (const lockPeriodWithRewardsRate of lockPeriodsWithRewardsRates) {
          data.push({
            supportedToken,
            itemWithPrice,
            lockPeriodWithRewardsRate,
          })
        }
      }
    }
    return data
  }

  async function regularUnitTest_buyItem(
    inputToken: string,
    itemWithPrice: RentStaking.ItemStructOutput,
    lockPeriodWithRewardsRate: RentStaking.LockPeriodStructOutput,
  ) {
    const user = user1
    const slippage = 10 // 10%
    const inputTokenAmount = await ERC20Minter.mint(inputToken, user.address, 20000)
    const tokenId = await rentStaking.nextTokenId()

    const buyPriceByToken = await rentStaking.getBuyPriceByToken(itemWithPrice.name, inputToken)
    const buyPriceWithSlippage = buyPriceByToken.mul(100 + slippage).div(100)

    let txBuy: ContractTransaction = await buy(
      inputToken,
      itemWithPrice,
      lockPeriodWithRewardsRate,
      user,
      buyPriceWithSlippage,
    )
    const receiptBuy = await txBuy.wait()

    await expect(txBuy).to.emit(rentStaking, 'Buy').withArgs(
      user.address, // recipeint,
      tokenId, // tokenId
      inputToken, // tokenForPay
      anyValue, // tokenAmunt
    )

    await expect(txBuy).to.emit(rentStaking, 'Transfer').withArgs(
      ethers.constants.AddressZero, // from,
      user.address, // to
      tokenId, // tokenId
    )

    const tokenInfo = await rentStaking.tokensInfo(tokenId)
    const buyPrice = await rentStaking.getBuyPriceByUSD(itemWithPrice.name)
    const sellPrice = await rentStaking.calculateSellPrice(buyPrice)
    const timestamp = (await ethers.provider.getBlock(receiptBuy.blockNumber)).timestamp

    assert(tokenInfo.itemName == itemWithPrice.name, '!itemName')
    assert(tokenInfo.lockPeriod.eq(lockPeriodWithRewardsRate.lockTime), '!lockPeriod')
    assert(tokenInfo.buyPrice.eq(buyPrice), '!buyPrice')
    assert(tokenInfo.sellPrice.eq(sellPrice), '!sellPrice')
    assert(tokenInfo.initTimestamp.eq(timestamp), '!initTimestamp')
    assert(tokenInfo.lastRewardTimestamp.eq(timestamp), '!lastRewardTimestamp')
    assert(tokenInfo.withdrawnRewards.eq(0), '!withdrawnRewards')
  }

  async function errorUnitTest_buyItem_notEnoughFunds(
    inputToken: string,
    itemWithPrice: RentStaking.ItemStructOutput,
    lockPeriodWithRewardsRate: RentStaking.LockPeriodStructOutput,
  ) {
    const user = user1
    const inputTokenAmount = await ERC20Minter.mint(inputToken, user.address, 20000)

    const buyPriceByToken = await rentStaking.getBuyPriceByToken(itemWithPrice.name, inputToken)
    const errorByPrice = buyPriceByToken.mul(9).div(10)
    let txBuy: Promise<ContractTransaction> = buy(
      inputToken,
      itemWithPrice,
      lockPeriodWithRewardsRate,
      user,
      errorByPrice,
    )

    await expect(txBuy).to.be.revertedWith('RentStaking: not enough funds!')
  }

  async function buy(
    inputToken: string,
    itemWithPrice: RentStaking.ItemStructOutput,
    lockPeriodWithRewardsRate: RentStaking.LockPeriodStructOutput,
    user: SignerWithAddress,
    buyPrice: BigNumber,
  ): Promise<ContractTransaction> {
    if (inputToken == BNB_PLACEHOLDER) {
      return rentStaking
        .connect(user)
        .buy(itemWithPrice.name, lockPeriodWithRewardsRate.lockTime, inputToken, {
          value: buyPrice,
        })
    } else {
      const token = IERC20Metadata__factory.connect(inputToken, user)
      const txApprove = await token.approve(rentStaking.address, buyPrice)
      await txApprove.wait()
      return rentStaking
        .connect(user)
        .buy(itemWithPrice.name, lockPeriodWithRewardsRate.lockTime, inputToken)
    }
  }

  it('3', () => {})
})
