import { deployments, ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC20Metadata__factory, RentStaking, RentStaking__factory } from '../typechain-types'
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
import ERC20Minter from './utils/ERC20Minter'
import { ContractTransaction } from 'ethers'
import { assert, expect } from 'chai'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { RentStakingTestUtils } from './RentStaking.utils'

const INITIAL_DATA = {
  items: [
    {
      name: 'electric scooter',
      price: 1000,
    },
    {
      name: 'electric moped',
      price: 2000,
    },
    {
      name: 'electric bike',
      price: 3000,
    },
    {
      name: 'electric car',
      price: 5000,
    },
  ],

  lockPeriods: [
    {
      lockTime: 1,
      rewardsRate: 10,
    },
    {
      lockTime: 2,
      rewardsRate: 20,
    },
    {
      lockTime: 3,
      rewardsRate: 25,
    },
  ],

  supportedTokens: [
    {
      token: BNB_PLACEHOLDER,
      pricer: CHAINLINK_BNB_USD,
    }, // BUSD
    {
      token: BUSD,
      pricer: CHAINLINK_BUSD_USD,
    }, // BUSD
    {
      token: USDT,
      pricer: CHAINLINK_USDT_USD,
    }, // USDT
  ],
}

describe(`RentStaking`, () => {
  let rentStaking: RentStaking

  let initSnapshot: string

  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress

  before(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    user1 = accounts[8]
    user2 = accounts[9]

    await deployments.fixture(['RentStaking'])
    const RentStakingDeployment = await deployments.get('RentStaking')

    rentStaking = RentStaking__factory.connect(RentStakingDeployment.address, owner)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  // ------------------------------------------------------------------------------------
  // ----- INITIALIZED TESTS ------------------------------------------------------------
  // ------------------------------------------------------------------------------------

  it(`Regular unit: compare initial items`, async () => {
    const itemsLength = await rentStaking.itemsLength()
    const itemsWithPrice = await rentStaking.getItemsWithPrice(0, itemsLength)
    const initialItems = INITIAL_DATA.items

    assert(
      itemsWithPrice.length == initialItems.length,
      `!items length != initial | ${itemsWithPrice.length} != ${initialItems.length}`,
    )

    for (let i = 0; i < itemsWithPrice.length; i++) {
      assert(
        itemsWithPrice[i].name == initialItems[i].name,
        `item name != initial | ${itemsWithPrice[i].name} != ${initialItems[i].name}`,
      )
      assert(
        itemsWithPrice[i].price.eq(initialItems[i].price),
        `item price != initial | ${itemsWithPrice[i].price} != ${initialItems[i].price}`,
      )
    }
  })

  it(`Regular unit: compare initial lock periods`, async () => {
    const lockPeriodsLength = await rentStaking.lockPeriodsLength()
    const lockPeriodsWithRewardsRates = await rentStaking.getLockPeriodsWithRewardsRates(
      0,
      lockPeriodsLength,
    )
    const initialLockPeriods = INITIAL_DATA.lockPeriods

    assert(
      lockPeriodsWithRewardsRates.length == initialLockPeriods.length,
      `lock periods length != initial | ${lockPeriodsWithRewardsRates.length} != ${initialLockPeriods.length}`,
    )

    for (let i = 0; i < lockPeriodsWithRewardsRates.length; i++) {
      assert(
        lockPeriodsWithRewardsRates[i].lockTime.eq(initialLockPeriods[i].lockTime),
        `lock period time != initial | ${lockPeriodsWithRewardsRates[i].lockTime} != ${initialLockPeriods[i].lockTime}`,
      )
      assert(
        lockPeriodsWithRewardsRates[i].rewardsRate.eq(initialLockPeriods[i].rewardsRate),
        `lock period rewards rate != initial | ${lockPeriodsWithRewardsRates[i].rewardsRate} != ${initialLockPeriods[i].rewardsRate}`,
      )
    }
  })

  it(`Regular unit: compare initial supported tokens`, async () => {
    const supportedTokensLength = await rentStaking.supportedTokensLength()
    const supportedTokensWithPricers = await rentStaking.getSupportedTokensWithPricers(
      0,
      supportedTokensLength,
    )
    const initialSupportedTokens = INITIAL_DATA.supportedTokens

    assert(
      supportedTokensWithPricers.length == initialSupportedTokens.length,
      `supported tokens length != initial | ${supportedTokensWithPricers.length} != ${initialSupportedTokens.length}`,
    )

    for (let i = 0; i < supportedTokensWithPricers.length; i++) {
      assert(
        supportedTokensWithPricers[i].token == initialSupportedTokens[i].token,
        `supported token address != initial | ${supportedTokensWithPricers[i].token} != ${initialSupportedTokens[i].token}`,
      )
      assert(
        supportedTokensWithPricers[i].pricer == initialSupportedTokens[i].pricer,
        `supported token pricer != initial | ${supportedTokensWithPricers[i].pricer} != ${initialSupportedTokens[i].pricer}`,
      )
    }
  })

  // // ------------------------------------------------------------------------------------
  // // ----- GOVERNANCE TESTS -------------------------------------------------------------
  // // ------------------------------------------------------------------------------------

  // // _____________
  // // REGULAR TESTS

  it(`Regular owner unit: add item`, async () => {
    const name = 'electric plane'
    const price = 10000

    const beforeLength = await rentStaking.itemsLength()

    const tx = await rentStaking.addItem(name, price)
    await tx.wait()

    const afterLength = await rentStaking.itemsLength()
    assert(afterLength.eq(beforeLength.add(1)), 'itemsLength not updated!')

    const newIndex = await rentStaking.itemsIndexes(name)
    assert(newIndex.eq(beforeLength), 'itemsIndexes not updated!')

    const item = await rentStaking.items(newIndex)
    assert(item == name, 'items not updated!')

    const itemPrice = await rentStaking.itemsPrices(name)
    assert(itemPrice.eq(price), 'itemsPrice not updated')

    await expect(tx).to.emit(rentStaking, 'AddItem').withArgs(
      name, // name,
      price, // price
    )
  })

  it(`Regular owner unit: update item price`, async () => {
    const item = INITIAL_DATA.items[0]
    const newPrice = item.price * 2

    const tx = await rentStaking.updateItemPrice(item.name, newPrice)
    await tx.wait()

    const resultPrice = await rentStaking.itemsPrices(item.name)
    assert(resultPrice.eq(newPrice), 'item price not updated')

    await expect(tx).to.emit(rentStaking, 'UpdateItemPrice').withArgs(
      item.name, // name,
      item.price, // oldPrice
      newPrice, // newPrice
    )
  })

  it(`Regular owner unit: delete item`, async () => {
    const item = INITIAL_DATA.items[INITIAL_DATA.items.length - 1]

    const lengthBefore = await rentStaking.itemsLength()
    const tx = await rentStaking.deleteItem(item.name)
    await tx.wait()

    const lengthAfter = await rentStaking.itemsLength()
    assert(lengthAfter.eq(lengthBefore.sub(1)), 'itemsLength not updated')

    const newIndex = await rentStaking.itemsIndexes(item.name)
    assert(newIndex.eq(0), 'itemsIndexes not reset!')

    await expect(tx).to.emit(rentStaking, 'DeleteItem').withArgs(
      item.name, // name,
    )
  })

  it(`Regular owner unit: add lock period`, async () => {
    const lockPeriod = 5
    const rewardsRate = 50

    const beforeLength = await rentStaking.lockPeriodsLength()

    const tx = await rentStaking.addLockPeriod(lockPeriod, rewardsRate)
    await tx.wait()

    const afterLength = await rentStaking.itemsLength()
    assert(afterLength.eq(beforeLength.add(1)), 'lockPeriodsLength not updated!')

    const newIndex = await rentStaking.lockPeriodsIndexes(lockPeriod)
    assert(newIndex.eq(beforeLength), 'lockPeriodsIndexes not updated!')

    const _lockPeriod = await rentStaking.lockPeriods(newIndex)
    assert(_lockPeriod.eq(lockPeriod), 'lockPeriods not updated!')

    const _rewardsRate = await rentStaking.lockPeriodsRewardRates(lockPeriod)
    assert(_rewardsRate.eq(rewardsRate), 'lockPeriodsRewardRates not updated')

    await expect(tx).to.emit(rentStaking, 'AddLockPeriod').withArgs(
      lockPeriod, // lockTime,
      rewardsRate, // rewardsRate
    )
  })

  it(`Regular owner unit: update lock period reward rates`, async () => {
    const lockPeriod = INITIAL_DATA.lockPeriods[0]
    const newRates = lockPeriod.rewardsRate * 2

    const tx = await rentStaking.updateLockPeriodRewardsRate(lockPeriod.lockTime, newRates)
    await tx.wait()

    const resultRates = await rentStaking.lockPeriodsRewardRates(lockPeriod.lockTime)
    assert(resultRates.eq(newRates), 'reward rates not updated')

    await expect(tx).to.emit(rentStaking, 'UpdateLockPeriodRewardsRate').withArgs(
      lockPeriod.lockTime, // lockPeriod,
      lockPeriod.rewardsRate, // oldRewardsRate
      newRates, // newRewardsRate
    )
  })

  it(`Regular owner unit: delete lock period`, async () => {
    const lockPeriod = INITIAL_DATA.lockPeriods[INITIAL_DATA.lockPeriods.length - 1]

    const lengthBefore = await rentStaking.lockPeriodsLength()
    const tx = await rentStaking.deleteLockPeriod(lockPeriod.lockTime)
    await tx.wait()

    const lengthAfter = await rentStaking.lockPeriodsLength()
    assert(lengthAfter.eq(lengthBefore.sub(1)), 'lockPeriodsLength not updated')

    const newIndex = await rentStaking.lockPeriodsIndexes(lockPeriod.lockTime)
    assert(newIndex.eq(0), 'lockPeriodsIndexes not reset!')

    await expect(tx).to.emit(rentStaking, 'DeleteLockPeriod').withArgs(
      lockPeriod.lockTime, // lockPeriod,
    )
  })

  it(`Regular owner unit: add supported token`, async () => {
    const token = LINK
    const pricer = CHAINLINK_LINK_USD

    const beforeLength = await rentStaking.supportedTokensLength()

    const tx = await rentStaking.addToken(token, pricer)
    await tx.wait()

    const afterLength = await rentStaking.supportedTokensLength()
    assert(afterLength.eq(beforeLength.add(1)), 'supportedTokensLength not updated!')

    const newIndex = await rentStaking.supportedTokensIndexes(token)
    assert(newIndex.eq(beforeLength), 'supportedTokensIndexes not updated!')

    const supportedToken = await rentStaking.supportedTokens(newIndex)
    assert(supportedToken == token, 'supportedTokens not updated!')

    const _pricer = await rentStaking.pricers(token)
    assert(_pricer == pricer, 'pricers not updated')

    await expect(tx).to.emit(rentStaking, 'AddToken').withArgs(
      token, // token,
      pricer, // pricer
    )
  })

  it(`Regular owner unit: update pricer`, async () => {
    const supportedToken = INITIAL_DATA.supportedTokens[0]
    const newPricer = CHAINLINK_LINK_USD // hardcode other pricer

    const tx = await rentStaking.updateTokenPricer(supportedToken.token, newPricer)
    await tx.wait()

    const pricer = await rentStaking.pricers(supportedToken.token)
    assert(pricer == newPricer, 'pricers not updated')

    await expect(tx).to.emit(rentStaking, 'UpdateTokenPricer').withArgs(
      supportedToken.token, // token,
      supportedToken.pricer, // oldPricer
      newPricer, // newPricer
    )
  })

  it(`Regular owner unit: delete supported token`, async () => {
    // ! TODO: case with withdraw balances
    const supportedToken = INITIAL_DATA.supportedTokens[INITIAL_DATA.supportedTokens.length - 1]

    const lengthBefore = await rentStaking.supportedTokensLength()
    const tx = await rentStaking.deleteToken(supportedToken.token)
    await tx.wait()

    const lengthAfter = await rentStaking.supportedTokensLength()
    assert(lengthAfter.eq(lengthBefore.sub(1)), 'supportedTokensLength not updated')

    const newIndex = await rentStaking.supportedTokensIndexes(supportedToken.token)
    assert(newIndex.eq(0), 'supportedTokensIndexes not reset!')

    await expect(tx).to.emit(rentStaking, 'DeleteToken').withArgs(
      supportedToken.token, // token,
    )
  })

  // // ____________
  // // ERRORS TESTS

  it(`Error owner unit: deposit not owner`, async () => {
    const user = user1
    const token = INITIAL_DATA.supportedTokens[0].token

    const balance = await ERC20Minter.mint(token, user.address, 1000)

    if (token != BNB_PLACEHOLDER) {
      const txApprove = await IERC20Metadata__factory.connect(token, user).approve(
        rentStaking.address,
        balance,
      )
      await txApprove.wait()
    }

    expect(rentStaking.connect(user).deposit(token, balance)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: deposit not supported token`, async () => {
    const token = LINK

    const balance = await ERC20Minter.mint(token, owner.address, 1000)

    const txApprove = await IERC20Metadata__factory.connect(token, owner).approve(
      rentStaking.address,
      balance,
    )
    await txApprove.wait()

    expect(rentStaking.deposit(token, balance)).to.be.revertedWith(
      "can't deposit unsupported token!",
    )
  })

  it(`Error owner unit: withdraw not owner`, async () => {
    const user = user2
    const token = INITIAL_DATA.supportedTokens[0].token
    const item = INITIAL_DATA.items[0]
    const lockPeriod = INITIAL_DATA.lockPeriods[0]
    // Before buy
    const slippage = 10 // 10%
    const buyPriceByToken = await rentStaking.getBuyPriceByToken(item.name, token)
    const buyPriceWithSlippage = buyPriceByToken.mul(100 + slippage).div(100)
    let txBuy: ContractTransaction = await RentStakingTestUtils.buy(
      rentStaking,
      token,
      item,
      lockPeriod,
      user,
      buyPriceWithSlippage,
    )
    await txBuy.wait()

    const balanceToWithdraw = await rentStaking.tokensToOwnerWithdrawBalances(token)

    expect(rentStaking.connect(user).withdraw(token, balanceToWithdraw)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: withdraw amount > balance`, async () => {
    const user = user2
    const token = INITIAL_DATA.supportedTokens[0].token
    const item = INITIAL_DATA.items[0]
    const lockPeriod = INITIAL_DATA.lockPeriods[0]
    // Before buy
    const slippage = 10 // 10%
    const buyPriceByToken = await rentStaking.getBuyPriceByToken(item.name, token)
    const buyPriceWithSlippage = buyPriceByToken.mul(100 + slippage).div(100)
    let txBuy: ContractTransaction = await RentStakingTestUtils.buy(
      rentStaking,
      token,
      item,
      lockPeriod,
      user,
      buyPriceWithSlippage,
    )
    await txBuy.wait()

    const balanceToWithdraw = await rentStaking.tokensToOwnerWithdrawBalances(token)

    expect(rentStaking.withdraw(token, balanceToWithdraw.mul(2))).to.be.revertedWith(
      'insufficient funds!',
    )
  })

  it(`Error owner unit: add item not owner`, async () => {
    const name = 'electric plane'
    const price = 10000
    const user = user1

    expect(rentStaking.connect(user).addItem(name, price)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: update item price not owner`, async () => {
    const item = INITIAL_DATA.items[0]
    const newPrice = item.price * 2
    const user = user1

    expect(rentStaking.connect(user).updateItemPrice(item.name, newPrice)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: delete item not owner`, async () => {
    const item = INITIAL_DATA.items[0]
    const user = user1

    expect(rentStaking.connect(user).deleteItem(item.name)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: add lockPeriod not owner`, async () => {
    const lockPeriod = 5
    const rewardsRate = 50
    const user = user1

    expect(rentStaking.connect(user).addLockPeriod(lockPeriod, rewardsRate)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: update lockPeriod rewardsRate not owner`, async () => {
    const lockPeriod = INITIAL_DATA.lockPeriods[0]
    const newRates = lockPeriod.rewardsRate * 2
    const user = user1

    expect(
      rentStaking.connect(user).updateLockPeriodRewardsRate(lockPeriod.lockTime, newRates),
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it(`Error owner unit: update lockPeriod rewardsRate not owner`, async () => {
    const lockPeriod = INITIAL_DATA.lockPeriods[0]
    const user = user1

    expect(rentStaking.connect(user).deleteLockPeriod(lockPeriod.lockTime)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: add token not owner`, async () => {
    const token = LINK
    const pricer = CHAINLINK_LINK_USD
    const user = user1

    expect(rentStaking.connect(user).addToken(token, pricer)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it(`Error owner unit: update token pricer not owner`, async () => {
    const supportedToken = INITIAL_DATA.supportedTokens[0]
    const newPricer = CHAINLINK_LINK_USD // hardcode other pricer
    const user = user1

    expect(
      rentStaking.connect(user).updateTokenPricer(supportedToken.token, newPricer),
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it(`Error owner unit: delete token not owner`, async () => {
    const supportedToken = INITIAL_DATA.supportedTokens[0]
    const user = user1

    expect(rentStaking.connect(user).deleteToken(supportedToken.token)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  // ------------------------------------------------------------------------------------
  // ----- BUSINESS LOGIC TESTS ---------------------------------------------------------
  // ------------------------------------------------------------------------------------

  // _____________
  // REGULAR TESTS

  for (const initialToken of INITIAL_DATA.supportedTokens) {
    for (const initialItem of INITIAL_DATA.items) {
      for (const initialLockPeriod of INITIAL_DATA.lockPeriods) {
        it(`Regular unit: token ${initialToken.token} buy item ${initialItem.name} with lock period ${initialLockPeriod.lockTime} `, async () => {
          const inputToken = initialToken.token
          const itemWithPrice = initialItem
          const lockPeriodWithRewardsRate = initialLockPeriod

          const user = user1
          const slippage = 10 // 10%
          const inputTokenAmount = await ERC20Minter.mint(inputToken, user.address, 20000)
          const tokenId = await rentStaking.nextTokenId()

          const buyPriceByToken = await rentStaking.getBuyPriceByToken(
            itemWithPrice.name,
            inputToken,
          )
          const buyPriceWithSlippage = buyPriceByToken.mul(100 + slippage).div(100)

          let txBuy: ContractTransaction = await RentStakingTestUtils.buy(
            rentStaking,
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
          const secondsPerDay = 24 * 60 * 60
          const initialDayTimestamp =
            Math.floor(
              (await ethers.provider.getBlock(receiptBuy.blockNumber)).timestamp / secondsPerDay,
            ) * secondsPerDay

          assert(tokenInfo.itemName == itemWithPrice.name, '!itemName')
          assert(tokenInfo.lockPeriod.eq(lockPeriodWithRewardsRate.lockTime), '!lockPeriod')
          assert(tokenInfo.buyPrice.eq(buyPrice), '!buyPrice')
          assert(tokenInfo.sellPrice.eq(sellPrice), '!sellPrice')
          assert(
            tokenInfo.initialDayTimestamp.eq(initialDayTimestamp),
            `tokenInfo.initialDayTimestamp != initialDayTimestamp | ${tokenInfo.initialDayTimestamp} != ${initialDayTimestamp}`,
          )
          assert(
            tokenInfo.lastRewardTimestamp.eq(initialDayTimestamp),
            `tokenInfo.lastRewardTimestamp != initialDayTimestamp | ${tokenInfo.lastRewardTimestamp} != ${initialDayTimestamp}`,
          )
          assert(tokenInfo.withdrawnRewards.eq(0), '!withdrawnRewards')

          console.log('aw123')
          // Deposit balance
          const token = IERC20Metadata__factory.connect(inputToken, user)

          console.log('aw124')
          await ERC20Minter.mint(inputToken, owner.address, 1000000)
          console.log('aw125')
          const depositAmount = ethers.utils.parseUnits(
            '1000000',
            await RentStakingTestUtils.decimals(inputToken),
          )
          const txDeposit = await RentStakingTestUtils.deposit(
            rentStaking,
            owner,
            inputToken,
            depositAmount,
          )
          await txDeposit.wait()

          // Claim with not expired

          const txClaimError = rentStaking.connect(user).claimRewards(tokenId, inputToken)
          expect(txClaimError).to.be.revertedWith('not has expired periods!')
          console.log('aw1210')
          // Regular claim
          await time.increase(30 * 24 * 60 * 60)
          const claimedPeriodsCount = await rentStaking.calculatePeriodsCountToClaimNow(tokenId)

          const balanceBefore = await RentStakingTestUtils.balanceOf(user.address, inputToken)
          const calcaluatedRewardsByUSD = await rentStaking.rewardsToWithdrawByUSD(tokenId)
          const calcaluatedRewardsByToken = await rentStaking.rewardsToWithdrawByToken(
            tokenId,
            inputToken,
          )
          const calcaluatedRewards = await rentStaking.rewardsToWithdrawByToken(tokenId, inputToken)
          const txClaim = await rentStaking.connect(user).claimRewards(tokenId, inputToken)
          await txClaim.wait()

          const balanceAfter = await RentStakingTestUtils.balanceOf(user.address, inputToken)
          console.log('aw1267')

          assert(
            RentStakingTestUtils.compareBalances(
              inputToken,
              balanceBefore,
              balanceAfter,
              calcaluatedRewards,
            ),
            `Claim balance fail balanceAfter - balanceBefore != calcaluatedRewards | ${balanceAfter} - ${balanceBefore} != ${calcaluatedRewards}`,
          )
          console.log('aw12677')
          console.log(`claimedPeriodsCount ${claimedPeriodsCount}`)

          await expect(txClaim).to.emit(rentStaking, 'ClaimRewards').withArgs(
            user.address, // recipient,
            tokenId, // tokenId
            inputToken, // withdrawnToken
            claimedPeriodsCount, // claimedPeriodsCount
            calcaluatedRewardsByUSD, // rewardsByUsd
            calcaluatedRewardsByToken, // rewardsByToken
          )
          console.log('aw1268')

          // Half period eror claim
          {
            await time.increase(15 * 24 * 60 * 60)

            const txClaimError = rentStaking.connect(user).claimRewards(tokenId, inputToken)
            expect(txClaimError).to.be.revertedWith('not has expired periods!')
          }
          console.log('aw1269')

          // Regular double periods claim
          {
            await time.increase((31 + 16) * 24 * 60 * 60)

            const token = IERC20Metadata__factory.connect(inputToken, user)
            const claimedPeriodsCount = await rentStaking.calculatePeriodsCountToClaimNow(tokenId)

            const balanceBefore = await RentStakingTestUtils.balanceOf(user.address, inputToken)
            const calcaluatedRewardsByUSD = await rentStaking.rewardsToWithdrawByUSD(tokenId)
            const calcaluatedRewardsByToken = await rentStaking.rewardsToWithdrawByToken(
              tokenId,
              inputToken,
            )
            const calcaluatedRewards = await rentStaking.rewardsToWithdrawByToken(
              tokenId,
              inputToken,
            )
            const txClaim = await rentStaking.connect(user).claimRewards(tokenId, inputToken)
            await txClaim.wait()
            const balanceAfter = await RentStakingTestUtils.balanceOf(user.address, inputToken)

            assert(
              RentStakingTestUtils.compareBalances(
                inputToken,
                balanceBefore,
                balanceAfter,
                calcaluatedRewards,
              ),
              `Claim balance fail balanceAfter - balanceBefore != calcaluatedRewards | ${balanceAfter} - ${balanceBefore} != ${calcaluatedRewards}`,
            )

            await expect(txClaim).to.emit(rentStaking, 'ClaimRewards').withArgs(
              user.address, // recipient,
              tokenId, // tokenId
              inputToken, // withdrawnToken
              claimedPeriodsCount, // claimedPeriodsCount
              calcaluatedRewardsByUSD, // rewardsByUsd
              calcaluatedRewardsByToken, // rewardsByToken
            )
          }

          {
            const tokenInfo = await rentStaking.tokensInfo(tokenId)
            expect(rentStaking.connect(user).sell(tokenId, inputToken)).to.be.revertedWith('blocking period has not expired!')

            await time.increase(tokenInfo.lockPeriod.mul(12 * 30 * 24 * 60 * 60))
            expect(rentStaking.connect(user).sell(tokenId, inputToken)).to.be.revertedWith('claim rewards before sell!')

            const token = IERC20Metadata__factory.connect(inputToken, user)
            const claimedPeriodsCount = await rentStaking.calculatePeriodsCountToClaimNow(tokenId)

            const balanceBefore = await RentStakingTestUtils.balanceOf(user.address, inputToken)
            const calcaluatedRewardsByUSD = await rentStaking.rewardsToWithdrawByUSD(tokenId)
            const calcaluatedRewardsByToken = await rentStaking.rewardsToWithdrawByToken(
              tokenId,
              inputToken,
            )
            const calcaluatedRewards = await rentStaking.rewardsToWithdrawByToken(
              tokenId,
              inputToken,
            )
            const txClaim = await rentStaking.connect(user).claimRewards(tokenId, inputToken)
            await txClaim.wait()
            const balanceAfter = await RentStakingTestUtils.balanceOf(user.address, inputToken)

            assert(
              RentStakingTestUtils.compareBalances(
                inputToken,
                balanceBefore,
                balanceAfter,
                calcaluatedRewards,
              ),
              `Claim balance fail balanceAfter - balanceBefore != calcaluatedRewards | ${balanceAfter} - ${balanceBefore} != ${calcaluatedRewards}`,
            )

            await expect(txClaim).to.emit(rentStaking, 'ClaimRewards').withArgs(
              user.address, // recipient,
              tokenId, // tokenId
              inputToken, // withdrawnToken
              claimedPeriodsCount, // claimedPeriodsCount
              calcaluatedRewardsByUSD, // rewardsByUsd
              calcaluatedRewardsByToken, // rewardsByToken
            )

            const txSell = await rentStaking.connect(user).sell(tokenId, inputToken)
            await txSell.wait()

            await expect(txSell).to.emit(rentStaking, 'Sell').withArgs(
              user.address, // recipient,
              tokenId, // tokenId
            )

            await expect(rentStaking.ownerOf(tokenId)).to.be.revertedWith('ERC721: invalid token ID')
          }
        })
        break;
      }
      break;
    }
    break;
  }
return
  // ____________
  // ERRORS TESTS

  for (const initialToken of INITIAL_DATA.supportedTokens) {
    for (const initialItem of INITIAL_DATA.items) {
      for (const initialLockPeriod of INITIAL_DATA.lockPeriods) {
        it(`Error unit(not enough funds): token ${initialToken.token} buy item ${initialItem.name} with lock period ${initialLockPeriod.lockTime} `, async () => {
          const inputToken = initialToken.token
          const itemWithPrice = initialItem
          const lockPeriodWithRewardsRate = initialLockPeriod
          const user = user1
          const inputTokenAmount = await ERC20Minter.mint(inputToken, user.address, 20000)

          const buyPriceByToken = await rentStaking.getBuyPriceByToken(
            itemWithPrice.name,
            inputToken,
          )
          const errorByPrice = buyPriceByToken.mul(9).div(10)
          let txBuy: Promise<ContractTransaction> = RentStakingTestUtils.buy(
            rentStaking,
            inputToken,
            itemWithPrice,
            lockPeriodWithRewardsRate,
            user,
            errorByPrice,
          )

          await expect(txBuy).to.be.revertedWith('insufficient funds to pay!')
        })
      }
    }
  }
})
