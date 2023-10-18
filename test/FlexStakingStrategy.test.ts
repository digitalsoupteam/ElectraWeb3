import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  FlexStakingStrategy,
  FlexStakingStrategy__factory,
  IERC20Metadata,
  IERC20Metadata__factory,
  Item,
  Item__factory,
  Treasury,
  Treasury__factory,
} from '../typechain-types'
import { ELCT, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { BigNumber } from 'ethers'
import { time } from '@nomicfoundation/hardhat-network-helpers'

const TEST_DATA = {
  tokens: [
    USDT, //
    ELCT,
  ],
  items: [
    'MopedItem',
    'MopedSparePartItem',
  ],
  startDay: [
    1, //
    15,
  ],
  subSellMonths: [
    0, //
    1,
    2,
    3,
  ],
  stakingStrategies: [
    'FiveYearsFlexStakingStrategy', //
  ],
}

describe(`FlexStakingStratgey`, () => {
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  let treasury: Treasury
  let nextTokenInitialTimestamp: number

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]
    await deployments.fixture()
    const TreasuryDeployment = await deployments.get('Treasury')
    treasury = Treasury__factory.connect(TreasuryDeployment.address, productOwner)

    // Set first day
    let block = await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    let date = new Date(block.timestamp * 1000)
    await time.increaseTo(
      Math.ceil(new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1)).getTime() / 1000),
    )
    block = await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    date = new Date(block.timestamp * 1000)
    assert(date.getDate() == 1, `Failed set 1 day: ${date.getDate()}`)

    nextTokenInitialTimestamp = Math.ceil(
      new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1)).getTime() / 1000,
    )

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  for (const stakingStrategyTag of TEST_DATA.stakingStrategies) {
    describe(`Staking strategy ${stakingStrategyTag}`, () => {
      let stakingStrategy: FlexStakingStrategy

      beforeEach(async () => {
        const StakingStrategyDeployment = await deployments.get(stakingStrategyTag)
        stakingStrategy = FlexStakingStrategy__factory.connect(
          StakingStrategyDeployment.address,
          user,
        )
      })

      for (const itemTag of TEST_DATA.items) {
        describe(`Item ${itemTag}`, () => {
          let item: Item

          beforeEach(async () => {
            const ItemDeployment = await deployments.get(itemTag)
            item = Item__factory.connect(ItemDeployment.address, user)
          })

          for (const tokenAddress of TEST_DATA.tokens) {
            describe(`Token ${tokenAddress}`, () => {
              let token: IERC20Metadata
              let mintedPayTokensAmount: BigNumber

              beforeEach(async () => {
                token = IERC20Metadata__factory.connect(tokenAddress, user)
                mintedPayTokensAmount = await ERC20Minter.mint(token.address, user.address, 100000)
                await token.approve(item.address, mintedPayTokensAmount)

                await ERC20Minter.mint(token.address, treasury.address, 10000000) // deposit to treasury
              })

              for (const startDay of TEST_DATA.startDay) {
                describe(`startDay ${startDay}`, () => {
                  let daysDiff: number
                  beforeEach(async () => {
                    // set initial day
                    await time.increaseTo(nextTokenInitialTimestamp)
                    if (startDay - 1 > 0) await time.increase((startDay - 1) * 24 * 60 * 60)
                    console.log(`aw15 ${await getDate()}`)
                    const block = await ethers.provider.getBlock(
                      await ethers.provider.getBlockNumber(),
                    )
                    const date = new Date(block.timestamp * 1000)
                    assert(
                      date.getDate() == startDay,
                      `Failed set startDay day: ${date.getDate()}`,
                    )
                    const daysInMonth = new Date(
                      date.getFullYear(),
                      date.getMonth(),
                      0,
                    ).getDate()
                    daysDiff = daysInMonth - startDay
                  })

                  describe(`Has other tokens`, () => {
                    const tokenId = 1
                    let tokenPrice: BigNumber
                    let initialMonths: number
                    let initialRewardsRate: BigNumber
                    let remainder: BigNumber
                    let minMonthsCount: number
                    let maxMonthsCount: number
                    let deprecationRate: BigNumber

                    beforeEach(async () => {
                      console.log(`aw1 ${await getDate()}`)
                      // other token
                      await item
                        .connect(user)
                        .mint(stakingStrategy.address, token.address, '0x')
                      // tested token
                      await item
                        .connect(user)
                        .mint(stakingStrategy.address, token.address, '0x')

                      tokenPrice = await item.price()
                      initialMonths = (await stakingStrategy.initialMonths()).toNumber()
                      initialRewardsRate = await stakingStrategy.initialRewardsRate()
                      remainder = await stakingStrategy.remainder(item.address, tokenId)
                      minMonthsCount = (await stakingStrategy.minMonthsCount()).toNumber()
                      maxMonthsCount = (await stakingStrategy.maxMonthsCount()).toNumber()
                      deprecationRate = await stakingStrategy.yearDeprecationRate()

                      console.log(
                        `${await getDate()}. token price ${ethers.utils.formatUnits(
                          tokenPrice,
                          18,
                        )}`,
                      )
                    })

                    it(`Regular: claim every period (min lock). startDay=${startDay}`, async () => {
                      for (let i = 0; i < daysDiff; i++) {
                        console.log(`IIIII ${i}`)
                        console.log(`initial days ${i} ${await getDate()}`)
                        await expect(
                          stakingStrategy
                            .connect(user)
                            .claim(item.address, tokenId, token.address),
                        ).to.be.revertedWith('rewards!')
                        if (i != daysDiff - 1) await time.increase(24 * 60 * 60)
                      }

                      let estimatedWithdrawnRewards = BigNumber.from('0')
                      for (let i = 0; i < minMonthsCount; i++) {
                        console.log(`\n jsi ${i}`)
                        await expect(
                          stakingStrategy
                            .connect(user)
                            .sell(item.address, tokenId, token.address),
                        ).to.be.revertedWith("can't sell!")
                        let claimTimestamp = await stakingStrategy.claimTimestamp(
                          item.address,
                          tokenId,
                          1 + i,
                        )
                        let [year, month] = await stakingStrategy.currentPeriod()

                        await time.increaseTo(claimTimestamp)

                        const formatedEarnings = 1000
                        const earnings = ethers.utils.parseUnits(`${formatedEarnings}`, 18)
                        await stakingStrategy.connect(productOwner).updateDeposits()
                        await stakingStrategy
                          .connect(productOwner)
                          .setEarnings(year, month, formatedEarnings)
                        const balanceBefore = await token.balanceOf(user.address)
                        await stakingStrategy
                          .connect(user)
                          .claim(item.address, tokenId, token.address)
                        const balanceAfter = await token.balanceOf(user.address)

                        let estimatedRewards = BigNumber.from('0')
                        let estimatedRewardsByToken = BigNumber.from('0')

                        if (i <= initialMonths) {
                          let initialItemsPrice = tokenPrice
                          if (i == 0) initialItemsPrice = tokenPrice.sub(remainder)
                          else if (i == initialMonths) initialItemsPrice = remainder
                          estimatedRewards = initialItemsPrice
                            .mul(initialRewardsRate)
                            .div(10000)
                          estimatedRewardsByToken = await treasury.usdAmountToToken(
                            estimatedRewards,
                            token.address,
                          )
                        }
                        if (i >= initialMonths) {
                          let earningsItemsPrice = tokenPrice
                          if (i == initialMonths) earningsItemsPrice = tokenPrice.sub(remainder)
                          else if (i == maxMonthsCount - 1) earningsItemsPrice = remainder
                          let deposits = await stakingStrategy.deposits(year, month)
                          estimatedRewards = estimatedRewards.add(
                            earningsItemsPrice
                              .mul(10000)
                              .mul(earnings)
                              .div(deposits)
                              .div(10000),
                          )
                          estimatedRewardsByToken = await treasury.usdAmountToToken(
                            estimatedRewards,
                            token.address,
                          )
                        }

                        const withdrawnRewards = await stakingStrategy.withdrawnRewards(
                          item.address,
                          tokenId,
                        )

                        estimatedWithdrawnRewards =
                          estimatedWithdrawnRewards.add(estimatedRewards)

                        assert(
                          withdrawnRewards.eq(estimatedWithdrawnRewards),
                          `withdrawnRewards != estimatedWithdrawnRewards. ${withdrawnRewards} != ${estimatedWithdrawnRewards}`,
                        )

                        console.log(
                          `${await getDate()}. i ${i}. rewards ${ethers.utils.formatUnits(
                            estimatedRewards,
                            18,
                          )}`,
                        )
                        assert(
                          balanceAfter.sub(balanceBefore).eq(estimatedRewardsByToken),
                          `flex rewards ${balanceAfter.sub(
                            balanceBefore,
                          )} != ${estimatedRewardsByToken}`,
                        )
                      }

                      await stakingStrategy.connect(productOwner).updateDeposits()
                      let balanceBefore = await token.balanceOf(user.address)
                      await stakingStrategy
                        .connect(user)
                        .sell(item.address, tokenId, token.address)
                      let balanceAfter = await token.balanceOf(user.address)

                      const estimatedBalance = await treasury.usdAmountToToken(
                        tokenPrice.sub(
                          tokenPrice
                            .mul(deprecationRate)
                            .mul(minMonthsCount - 1)
                            .div(12)
                            .div(10000),
                        ),
                        token.address,
                      )
                      console.log(
                        `${await getDate()}. balanceAfter.sub(balanceBefore) ${ethers.utils.formatUnits(
                          balanceAfter.sub(balanceBefore),
                          18,
                        )}`,
                      )
                      console.log(
                        `${await getDate()}. sell ${ethers.utils.formatUnits(
                          estimatedBalance,
                          18,
                        )}`,
                      )
                      assert(
                        balanceAfter.sub(balanceBefore).eq(estimatedBalance),
                        `sell balance ${balanceAfter.sub(
                          balanceBefore,
                        )} != ${estimatedBalance}`,
                      )

                      await expect(
                        stakingStrategy
                          .connect(user)
                          .sell(item.address, tokenId, token.address),
                      ).to.be.revertedWith('ERC721: invalid token ID')
                      await expect(
                        stakingStrategy
                          .connect(user)
                          .claim(item.address, tokenId, token.address),
                      ).to.be.revertedWith('ERC721: invalid token ID')
                    })

                    it(`Regular: claim all in one (min lock).`, async () => {
                      for (let i = 0; i < daysDiff; i++) {
                        console.log(`IIIII ${i}`)
                        console.log(`initial days ${i} ${await getDate()}`)
                        await expect(
                          stakingStrategy
                            .connect(user)
                            .claim(item.address, tokenId, token.address),
                        ).to.be.revertedWith('rewards!')
                        if (i != daysDiff - 1) await time.increase(24 * 60 * 60)
                      }

                      let estimatedRewards = BigNumber.from('0')
                      let estimatedRewardsByToken = BigNumber.from('0')
                      for (let i = 0; i < minMonthsCount; i++) {
                        console.log(`\n jsi ${i}`)
                        await expect(
                          stakingStrategy
                            .connect(user)
                            .sell(item.address, tokenId, token.address),
                        ).to.be.revertedWith("can't sell!")
                        let claimTimestamp = await stakingStrategy.claimTimestamp(
                          item.address,
                          tokenId,
                          1 + i,
                        )
                        let [year, month] = await stakingStrategy.currentPeriod()

                        await time.increaseTo(claimTimestamp)

                        const formatedEarnings = 1000
                        const earnings = ethers.utils.parseUnits(`${formatedEarnings}`, 18)
                        await stakingStrategy.connect(productOwner).updateDeposits()
                        await stakingStrategy
                          .connect(productOwner)
                          .setEarnings(year, month, formatedEarnings)

                        if (i <= initialMonths) {
                          let initialItemsPrice = tokenPrice
                          if (i == 0) initialItemsPrice = tokenPrice.sub(remainder)
                          else if (i == initialMonths) initialItemsPrice = remainder
                          estimatedRewards = estimatedRewards.add(
                            initialItemsPrice.mul(initialRewardsRate).div(10000),
                          )
                          estimatedRewardsByToken = await treasury.usdAmountToToken(
                            estimatedRewards,
                            token.address,
                          )
                        }
                        if (i >= initialMonths) {
                          let earningsItemsPrice = tokenPrice
                          if (i == initialMonths) earningsItemsPrice = tokenPrice.sub(remainder)
                          else if (i == maxMonthsCount - 1) earningsItemsPrice = remainder
                          let deposits = await stakingStrategy.deposits(year, month)
                          estimatedRewards = estimatedRewards.add(
                            earningsItemsPrice
                              .mul(10000)
                              .mul(earnings)
                              .div(deposits)
                              .div(10000),
                          )
                          estimatedRewardsByToken = await treasury.usdAmountToToken(
                            estimatedRewards,
                            token.address,
                          )
                        }
                      }

                      let balanceBefore = await token.balanceOf(user.address)
                      await stakingStrategy
                        .connect(user)
                        .claim(item.address, tokenId, token.address)
                      let balanceAfter = await token.balanceOf(user.address)

                      const withdrawnRewards = await stakingStrategy.withdrawnRewards(
                        item.address,
                        tokenId,
                      )

                      assert(
                        withdrawnRewards.eq(estimatedRewards),
                        `withdrawnRewards != estimatedRewards. ${withdrawnRewards} != ${estimatedRewards}`,
                      )
                      console.log(
                        `${await getDate()}. rewards ${ethers.utils.formatUnits(
                          estimatedRewards,
                          18,
                        )}`,
                      )
                      assert(
                        balanceAfter.sub(balanceBefore).eq(estimatedRewardsByToken),
                        `flex rewards ${balanceAfter.sub(
                          balanceBefore,
                        )} != ${estimatedRewardsByToken}`,
                      )

                      await stakingStrategy.connect(productOwner).updateDeposits()
                      balanceBefore = await token.balanceOf(user.address)
                      await stakingStrategy
                        .connect(user)
                        .sell(item.address, tokenId, token.address)
                      balanceAfter = await token.balanceOf(user.address)

                      const estimatedBalance = await treasury.usdAmountToToken(
                        tokenPrice.sub(
                          tokenPrice
                            .mul(deprecationRate)
                            .mul(minMonthsCount - 1)
                            .div(12)
                            .div(10000),
                        ),
                        token.address,
                      )
                      console.log(
                        `${await getDate()}. balanceAfter.sub(balanceBefore) ${ethers.utils.formatUnits(
                          balanceAfter.sub(balanceBefore),
                          18,
                        )}`,
                      )
                      console.log(
                        `${await getDate()}. sell ${ethers.utils.formatUnits(
                          estimatedBalance,
                          18,
                        )}`,
                      )
                      assert(
                        balanceAfter.sub(balanceBefore).eq(estimatedBalance),
                        `sell balance ${balanceAfter.sub(
                          balanceBefore,
                        )} != ${estimatedBalance}`,
                      )

                      await expect(
                        stakingStrategy
                          .connect(user)
                          .sell(item.address, tokenId, token.address),
                      ).to.be.revertedWith('ERC721: invalid token ID')
                      await expect(
                        stakingStrategy
                          .connect(user)
                          .claim(item.address, tokenId, token.address),
                      ).to.be.revertedWith('ERC721: invalid token ID')
                    })

                   

                    for (const subMonths of TEST_DATA.subSellMonths) {
                      it(`Regular: claim every period (max lock - ${subMonths}).`, async () => {
                        for (let i = 0; i < daysDiff; i++) {
                          console.log(`IIIII ${i}`)
                          console.log(`initial days ${i} ${await getDate()}`)
                          await expect(
                            stakingStrategy
                              .connect(user)
                              .claim(item.address, tokenId, token.address),
                          ).to.be.revertedWith('rewards!')
                          if (i != daysDiff - 1) await time.increase(24 * 60 * 60)
                        }

                        let estimatedWithdrawnRewards = BigNumber.from('0')
                        let estimatedRewardsByToken = BigNumber.from('0')
                        const claimMouthsCount = maxMonthsCount - subMonths
                        for (let i = 0; i < claimMouthsCount; i++) {
                          console.log(`\n jsi ${i}`)
                          if (i < minMonthsCount) {
                            await expect(
                              stakingStrategy
                                .connect(user)
                                .sell(item.address, tokenId, token.address),
                            ).to.be.revertedWith("can't sell!")
                          }
                          let claimTimestamp = await stakingStrategy.claimTimestamp(
                            item.address,
                            tokenId,
                            1 + i,
                          )
                          let [year, month] = await stakingStrategy.currentPeriod()

                          await time.increaseTo(claimTimestamp)

                          const formatedEarnings = 1000
                          const earnings = ethers.utils.parseUnits(`${formatedEarnings}`, 18)
                          await stakingStrategy.connect(productOwner).updateDeposits()
                          await stakingStrategy
                            .connect(productOwner)
                            .setEarnings(year, month, formatedEarnings)
                          const balanceBefore = await token.balanceOf(user.address)
                          await stakingStrategy
                            .connect(user)
                            .claim(item.address, tokenId, token.address)
                          const balanceAfter = await token.balanceOf(user.address)

                          let estimatedRewards = BigNumber.from('0')

                          if (i <= initialMonths) {
                            let initialItemsPrice = tokenPrice
                            if (i == 0) initialItemsPrice = tokenPrice.sub(remainder)
                            else if (i == initialMonths) initialItemsPrice = remainder
                            estimatedRewards = initialItemsPrice
                              .mul(initialRewardsRate)
                              .div(10000)
                            estimatedRewardsByToken = await treasury.usdAmountToToken(
                              estimatedRewards,
                              token.address,
                            )
                          }
                          if (i >= initialMonths) {
                            let earningsItemsPrice = tokenPrice
                            if (i == initialMonths) earningsItemsPrice = tokenPrice.sub(remainder)
                            else if (i == maxMonthsCount - 1) earningsItemsPrice = remainder
                            let deposits = await stakingStrategy.deposits(year, month)
                            estimatedRewards = estimatedRewards.add(
                              earningsItemsPrice
                                .mul(10000)
                                .mul(earnings)
                                .div(deposits)
                                .div(10000),
                            )
                            estimatedRewardsByToken = await treasury.usdAmountToToken(
                              estimatedRewards,
                              token.address,
                            )
                          }

                          const withdrawnRewards = await stakingStrategy.withdrawnRewards(
                            item.address,
                            tokenId,
                          )

                          estimatedWithdrawnRewards =
                            estimatedWithdrawnRewards.add(estimatedRewards)

                          assert(
                            withdrawnRewards.eq(estimatedWithdrawnRewards),
                            `withdrawnRewards != estimatedWithdrawnRewards. ${withdrawnRewards} != ${estimatedWithdrawnRewards}`,
                          )

                          console.log(
                            `${await getDate()}. i ${i}. rewards ${ethers.utils.formatUnits(
                              estimatedRewards,
                              18,
                            )}`,
                          )
                          assert(
                            balanceAfter.sub(balanceBefore).eq(estimatedRewardsByToken),
                            `flex rewards ${balanceAfter.sub(
                              balanceBefore,
                            )} != ${estimatedRewardsByToken}`,
                          )
                        }

                        await stakingStrategy.connect(productOwner).updateDeposits()
                        let balanceBefore = await token.balanceOf(user.address)
                        await stakingStrategy
                          .connect(user)
                          .sell(item.address, tokenId, token.address)
                        let balanceAfter = await token.balanceOf(user.address)

                        const estimatedBalance = await treasury.usdAmountToToken(
                          tokenPrice.sub(
                            tokenPrice
                              .mul(deprecationRate)
                              .mul(claimMouthsCount - 1)
                              .div(12)
                              .div(10000),
                          ),
                          token.address,
                        )
                        console.log(
                          `${await getDate()}. balanceAfter.sub(balanceBefore) ${ethers.utils.formatUnits(
                            balanceAfter.sub(balanceBefore),
                            18,
                          )}`,
                        )
                        console.log(
                          `${await getDate()}. sell ${ethers.utils.formatUnits(
                            estimatedBalance,
                            18,
                          )}`,
                        )
                        assert(
                          balanceAfter.sub(balanceBefore).eq(estimatedBalance),
                          `sell balance ${balanceAfter.sub(
                            balanceBefore,
                          )} != ${estimatedBalance}`,
                        )

                        await expect(
                          stakingStrategy
                            .connect(user)
                            .sell(item.address, tokenId, token.address),
                        ).to.be.revertedWith('ERC721: invalid token ID')
                        await expect(
                          stakingStrategy
                            .connect(user)
                            .claim(item.address, tokenId, token.address),
                        ).to.be.revertedWith('ERC721: invalid token ID')
                      })

                      it(`Regular: claim all in one (max lock - ${subMonths}).`, async () => {
                        for (let i = 0; i < daysDiff; i++) {
                          console.log(`IIIII ${i}`)
                          console.log(`initial days ${i} ${await getDate()}`)
                          await expect(
                            stakingStrategy
                              .connect(user)
                              .claim(item.address, tokenId, token.address),
                          ).to.be.revertedWith('rewards!')
                          if (i == daysDiff - 1) await time.increase(24 * 60 * 60)
                        }

                        let estimatedRewards = BigNumber.from('0')
                        let estimatedRewardsByToken = BigNumber.from('0')
                        const claimMouthsCount = maxMonthsCount - subMonths
                        for (let i = 0; i < claimMouthsCount; i++) {
                          console.log(`\n jsi ${i}`)
                          if (i < minMonthsCount) {
                            await expect(
                              stakingStrategy
                                .connect(user)
                                .sell(item.address, tokenId, token.address),
                            ).to.be.revertedWith("can't sell!")
                          }
                          let claimTimestamp = await stakingStrategy.claimTimestamp(
                            item.address,
                            tokenId,
                            1 + i,
                          )
                          let [year, month] = await stakingStrategy.currentPeriod()

                          await time.increaseTo(claimTimestamp)

                          const formatedEarnings = 1000
                          const earnings = ethers.utils.parseUnits(`${formatedEarnings}`, 18)
                          await stakingStrategy.connect(productOwner).updateDeposits()
                          await stakingStrategy
                            .connect(productOwner)
                            .setEarnings(year, month, formatedEarnings)

                          if (i <= initialMonths) {
                            let initialItemsPrice = tokenPrice
                            if (i == 0) initialItemsPrice = tokenPrice.sub(remainder)
                            else if (i == initialMonths) initialItemsPrice = remainder
                            estimatedRewards = estimatedRewards.add(
                              initialItemsPrice.mul(initialRewardsRate).div(10000),
                            )
                            estimatedRewardsByToken = await treasury.usdAmountToToken(
                              estimatedRewards,
                              token.address,
                            )
                          }
                          if (i >= initialMonths) {
                            let earningsItemsPrice = tokenPrice
                            if (i == initialMonths)
                              earningsItemsPrice = tokenPrice.sub(remainder)
                            else if (i == maxMonthsCount - 1) earningsItemsPrice = remainder
                            let deposits = await stakingStrategy.deposits(year, month)
                            estimatedRewards = estimatedRewards.add(
                              earningsItemsPrice
                                .mul(10000)
                                .mul(earnings)
                                .div(deposits)
                                .div(10000),
                            )
                            estimatedRewardsByToken = await treasury.usdAmountToToken(
                              estimatedRewards,
                              token.address,
                            )
                          }
                        }

                        let balanceBefore = await token.balanceOf(user.address)
                        await stakingStrategy
                          .connect(user)
                          .claim(item.address, tokenId, token.address)
                        let balanceAfter = await token.balanceOf(user.address)

                        const withdrawnRewards = await stakingStrategy.withdrawnRewards(
                          item.address,
                          tokenId,
                        )

                        assert(
                          withdrawnRewards.eq(estimatedRewards),
                          `withdrawnRewards != estimatedRewards. ${withdrawnRewards} != ${estimatedRewards}`,
                        )
                        console.log(
                          `${await getDate()}. rewards ${ethers.utils.formatUnits(
                            estimatedRewards,
                            18,
                          )}`,
                        )
                        assert(
                          balanceAfter.sub(balanceBefore).eq(estimatedRewardsByToken),
                          `flex rewards ${balanceAfter.sub(
                            balanceBefore,
                          )} != ${estimatedRewardsByToken}`,
                        )

                        await stakingStrategy.connect(productOwner).updateDeposits()
                        balanceBefore = await token.balanceOf(user.address)
                        await stakingStrategy
                          .connect(user)
                          .sell(item.address, tokenId, token.address)
                        balanceAfter = await token.balanceOf(user.address)

                        const estimatedBalance = await treasury.usdAmountToToken(
                          tokenPrice.sub(
                            tokenPrice
                              .mul(deprecationRate)
                              .mul(claimMouthsCount - 1)
                              .div(12)
                              .div(10000),
                          ),
                          token.address,
                        )
                        console.log(
                          `${await getDate()}. balanceAfter.sub(balanceBefore) ${ethers.utils.formatUnits(
                            balanceAfter.sub(balanceBefore),
                            18,
                          )}`,
                        )
                        console.log(
                          `${await getDate()}. sell ${ethers.utils.formatUnits(
                            estimatedBalance,
                            18,
                          )}`,
                        )
                        assert(
                          balanceAfter.sub(balanceBefore).eq(estimatedBalance),
                          `sell balance ${balanceAfter.sub(
                            balanceBefore,
                          )} != ${estimatedBalance}`,
                        )

                        await expect(
                          stakingStrategy
                            .connect(user)
                            .sell(item.address, tokenId, token.address),
                        ).to.be.revertedWith('ERC721: invalid token ID')
                        await expect(
                          stakingStrategy
                            .connect(user)
                            .claim(item.address, tokenId, token.address),
                        ).to.be.revertedWith('ERC721: invalid token ID')
                      })
                    }
                  })

                  describe(`Single token in supply`, () => {
                    it(`Regular: deposit update.`, async () => {
                      const tokenId = 0

                      await item
                        .connect(user)
                        .mint(stakingStrategy.address, token.address, '0x')

                      const tokenPrice = await item.price()
                      const initialMonths = (await stakingStrategy.initialMonths()).toNumber()
                      const minMonthsCount = (await stakingStrategy.minMonthsCount()).toNumber()
                      const maxMonthsCount = (await stakingStrategy.maxMonthsCount()).toNumber()

                      for (let i = 0; i < maxMonthsCount; i++) {
                        if (i < minMonthsCount) {
                          await expect(
                            stakingStrategy
                              .connect(user)
                              .sell(item.address, tokenId, token.address),
                          ).to.be.revertedWith("can't sell!")
                        }
                        let claimTimestamp = await stakingStrategy.claimTimestamp(
                          item.address,
                          tokenId,
                          1 + i,
                        )
                        let [year, month] = await stakingStrategy.currentPeriod()

                        await time.increaseTo(claimTimestamp.add(3))

                        const formatedEarnings = 1000
                        await stakingStrategy.connect(productOwner).updateDeposits()
                        await stakingStrategy
                          .connect(productOwner)
                          .setEarnings(year, month, formatedEarnings)

                        const deposits = await stakingStrategy.deposits(year, month)
                        console.log(`deposits ${i} ${deposits}`)
                        if (i < initialMonths) {
                          assert(deposits.eq(0), `deposits != 0, ${deposits} != 0`)
                        } else {
                          const remainder = await stakingStrategy.remainder(
                            item.address,
                            tokenId,
                          )
                          let deposits = await stakingStrategy.deposits(year, month)
                          let price = tokenPrice
                          if (i == initialMonths) price = tokenPrice.sub(remainder)
                          else if (i == maxMonthsCount - 1) price = remainder
                          assert(
                            deposits.eq(price),
                            `deposits != price, ${deposits} != ${price}`,
                          )
                        }
                      }

                      await time.increase(31 * 24 * 60 * 60)
                      let [year, month] = await stakingStrategy.currentPeriod()
                      const deposits = await stakingStrategy.deposits(year, month)
                      console.log(`deposits [*] ${deposits}`)

                      assert(deposits.eq(0), `deposits != 0, ${deposits} != 0`)
                    })
                  })
                })
              }
            })
          }
        })
      }
    })
  }
})

// --------------------------------------------------------------------------------
// -----  UTILS  ------------------------------------------------------------------
// --------------------------------------------------------------------------------

async function getDate() {
  const timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
    .timestamp
  return new Date(timestamp * 1000).toUTCString()
}
