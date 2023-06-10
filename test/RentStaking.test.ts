import { deployments, ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC20Metadata__factory, RentStaking, RentStaking__factory } from '../typechain-types'
import { BNB_PLACEHOLDER, BUSD, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { BigNumber, ContractReceipt, ContractTransaction } from 'ethers'
import { assert, expect } from 'chai'
import { Test } from 'mocha'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { time } from '@nomicfoundation/hardhat-network-helpers'

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
            await regularUnitTest_buyItem(
              supportedToken.token,
              itemWithPrice,
              lockPeriodWithRewardsRate,
            )
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

  async function balanceOf(account: string, token: string) {
    if (token == BNB_PLACEHOLDER) {
      return await ethers.provider.getBalance(account)
    } else {
      return await IERC20Metadata__factory.connect(token, ethers.provider).balanceOf(account)
    }
  }

  async function decimals(token: string) {
    if (token == BNB_PLACEHOLDER) {
      return 18
    } else {
      return await IERC20Metadata__factory.connect(token, ethers.provider).decimals()
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
    console.log('aw1')
    const sellPrice = await rentStaking.calculateSellPrice(buyPrice)
    console.log('aw12')
    const timestamp = (await ethers.provider.getBlock(receiptBuy.blockNumber)).timestamp

    assert(tokenInfo.itemName == itemWithPrice.name, '!itemName')
    assert(tokenInfo.lockPeriod.eq(lockPeriodWithRewardsRate.lockTime), '!lockPeriod')
    assert(tokenInfo.buyPrice.eq(buyPrice), '!buyPrice')
    assert(tokenInfo.sellPrice.eq(sellPrice), '!sellPrice')
    assert(tokenInfo.initTimestamp.eq(timestamp), '!initTimestamp')
    assert(tokenInfo.lastRewardTimestamp.eq(timestamp), '!lastRewardTimestamp')
    assert(tokenInfo.withdrawnRewards.eq(0), '!withdrawnRewards')

    console.log('aw123')
    // Deposit balance
    const token = IERC20Metadata__factory.connect(inputToken, user)

    console.log('aw124')
    await ERC20Minter.mint(inputToken, owner.address, 1000000)
    console.log('aw125')
    const depositAmount = ethers.utils.parseUnits('1000000', await decimals(inputToken))
    const txDeposit = await deposit(inputToken, depositAmount)
    await txDeposit.wait()

    // Claim with not expired

    const txClaimError = rentStaking.connect(user).claimRewards(tokenId, inputToken)
    expect(txClaimError).to.be.revertedWith('RentStaking: no usd rewards to withdraw!')
    console.log('aw1210')
    // Regular claim
    await time.increase(31 * 24 * 60 * 60)

    const balanceBefore = await balanceOf(user.address, inputToken)
    const calcaluatedRewardsByUSD = await rentStaking.rewardsToWithdrawByUSD(tokenId)
    const calcaluatedRewardsByToken = await rentStaking.rewardsToWithdrawByToken(
      tokenId,
      inputToken,
    )
    const calcaluatedRewards = await rentStaking.rewardsToWithdrawByToken(tokenId, inputToken)
    const txClaim = await rentStaking.connect(user).claimRewards(tokenId, inputToken)
    await txClaim.wait()
    const balanceAfter = await balanceOf(user.address, inputToken)
    console.log('aw1267')

    assert(
      compareBalances(inputToken, balanceBefore, balanceAfter, calcaluatedRewards),
      `Claim balance fail balanceAfter - balanceBefore != calcaluatedRewards | ${balanceAfter} - ${balanceBefore} != ${calcaluatedRewards}`,
    )

    await expect(txClaim).to.emit(rentStaking, 'ClaimRewards').withArgs(
      user.address, // recipient,
      tokenId, // tokenId
      calcaluatedRewardsByUSD, // rewardsByUsd
      calcaluatedRewardsByToken, // rewardsByToken
    )
    console.log('aw1268')

    // Half period eror claim
    {
      await time.increase(15 * 24 * 60 * 60)

      const txClaimError = rentStaking.connect(user).claimRewards(tokenId, inputToken)
      expect(txClaimError).to.be.revertedWith('RentStaking: no usd rewards to withdraw!')
    }
    console.log('aw1269')

    // Regular double periods claim
    {
      await time.increase((31 + 16) * 24 * 60 * 60)

      const token = IERC20Metadata__factory.connect(inputToken, user)

      const balanceBefore = await balanceOf(user.address, inputToken)
      const calcaluatedRewardsByUSD = await rentStaking.rewardsToWithdrawByUSD(tokenId)
      const calcaluatedRewardsByToken = await rentStaking.rewardsToWithdrawByToken(
        tokenId,
        inputToken,
      )
      const calcaluatedRewards = await rentStaking.rewardsToWithdrawByToken(tokenId, inputToken)
      const txClaim = await rentStaking.connect(user).claimRewards(tokenId, inputToken)
      await txClaim.wait()
      const balanceAfter = await balanceOf(user.address, inputToken)

      assert(
        compareBalances(inputToken, balanceBefore, balanceAfter, calcaluatedRewards),
        `Claim balance fail balanceAfter - balanceBefore != calcaluatedRewards | ${balanceAfter} - ${balanceBefore} != ${calcaluatedRewards}`,
      )

      await expect(txClaim).to.emit(rentStaking, 'ClaimRewards').withArgs(
        user.address, // recipient,
        tokenId, // tokenId
        calcaluatedRewardsByUSD, // rewardsByUsd
        calcaluatedRewardsByToken, // rewardsByToken
      )
    }
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

  async function deposit(
    inputToken: string,
    depositAmount: BigNumber,
  ): Promise<ContractTransaction> {
    if (inputToken == BNB_PLACEHOLDER) {
      return rentStaking.deposit(inputToken, depositAmount, { value: depositAmount })
    } else {
      const token = IERC20Metadata__factory.connect(inputToken, user)
      const txDepositApprove = await token
        .connect(owner)
        .approve(rentStaking.address, depositAmount)
      await txDepositApprove.wait()
      return rentStaking.deposit(inputToken, depositAmount)
    }
  }

  async function compareBalances(
    token: string,
    balanceBefore: BigNumber,
    balanceAfter: BigNumber,
    resultBalance: BigNumber,
  ) {
    if (token == BNB_PLACEHOLDER) {
      const slippage = 2 // 2%
      return balanceAfter.sub(balanceBefore).gte(resultBalance.mul(100 + slippage).div(100))
    } else {
      return balanceAfter.sub(balanceBefore).eq(resultBalance)
    }
  }

  it('placeholder', () => {})
})
