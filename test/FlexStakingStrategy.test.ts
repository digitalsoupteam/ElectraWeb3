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
import { USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { BigNumber } from 'ethers'
import { FixStakingStrategy } from '../typechain-types/contracts/stakings'
import { FixStakingStrategy__factory } from '../typechain-types/factories/contracts/stakings'
import { time } from '@nomicfoundation/hardhat-network-helpers'

const TEST_DATA = {
  tokens: [USDT],
  items: [
    'ScooterItem', //
    // 'BikeItem', 
    // 'MopedItem', 
    // 'CarItem', 
],
  mintedAmount: [
    1, //
    // 2, 
    // 10,
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

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]
    await deployments.fixture()
    const TreasuryDeployment = await deployments.get('Treasury')
    treasury = Treasury__factory.connect(TreasuryDeployment.address, productOwner)
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  for (const tokenAddress of TEST_DATA.tokens) {
    describe(`Token ${tokenAddress}`, () => {
      let token: IERC20Metadata
      let mintedPayTokensAmount: BigNumber

      beforeEach(async () => {
        token = IERC20Metadata__factory.connect(tokenAddress, user)
        mintedPayTokensAmount = await ERC20Minter.mint(token.address, user.address, 100000)
        await ERC20Minter.mint(token.address, treasury.address, 10000000) // deposit to treasury
      })

      for (const itemTag of TEST_DATA.items) {
        describe(`Item ${itemTag}`, () => {
          let item: Item

          beforeEach(async () => {
            const ItemDeployment = await deployments.get(itemTag)
            item = Item__factory.connect(ItemDeployment.address, user)
            await token.connect(user).approve(item.address, mintedPayTokensAmount)
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
              for (const mintAmount of TEST_DATA.mintedAmount) {
                it(`Regular: claim every period. mintAmount=${mintAmount}`, async () => {
                  await time.increase((31 + 30 + 22) * 24 * 60 * 60)

                  let tokenId = 1

                  const token = IERC20Metadata__factory.connect(tokenAddress, user)
                  await ERC20Minter.mint(token.address, treasury.address, 1000000)
                  const usdtAmount = await ERC20Minter.mint(token.address, user.address, 100000)

                  await token.approve(item.address, usdtAmount)
                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  await time.increase(60 * 24 * 60 * 60)

                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  console.log(`item.address ${item.address}`)
                  const initialTimestamp = await stakingStrategy.initialTimestamp(
                    item.address,
                    tokenId,
                  )
                  console.log(
                    `initialTimestamp ${initialTimestamp} ${new Date(
                      initialTimestamp.toNumber() * 1000,
                    ).toUTCString()}`,
                  )
                  const lastClaimTimestamp = await stakingStrategy.lastClaimTimestamp(
                    item.address,
                    tokenId,
                  )
                  console.log(
                    `lastClaimTimestamp ${lastClaimTimestamp} ${new Date(
                      lastClaimTimestamp.toNumber() * 1000,
                    ).toUTCString()}`,
                  )
                  const startSellTimestamp = await stakingStrategy.startSellTimestamp(
                    item.address,
                    tokenId,
                  )
                  console.log(
                    `startSellTimestamp ${startSellTimestamp} ${new Date(
                      startSellTimestamp.toNumber() * 1000,
                    ).toUTCString()}`,
                  )
                  const finalTimestamp = await stakingStrategy.finalTimestamp(item.address, tokenId)
                  console.log(
                    `finalTimestamp ${finalTimestamp} ${new Date(
                      finalTimestamp.toNumber() * 1000,
                    ).toUTCString()}`,
                  )
                  console.log(`remainder ${await stakingStrategy.remainder(item.address, tokenId)}`)

                  await expect(
                    stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                  ).to.be.revertedWith('rewards!')

                  const tokenPrice = await item.tokenPrice(tokenId)
                  const initialMonths = (await stakingStrategy.initialMonths()).toNumber()
                  const initialRewardsRate = await stakingStrategy.initialRewardsRate()

                  const minLockYears = (await stakingStrategy.minLockYears()).toNumber()
                  for (let i = 0; i < 12 * minLockYears; i++) {
                    await expect(
                      stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                    ).to.be.revertedWith("can't sell!")
                    let nextClaimTimestamp = await stakingStrategy.nextClaimTimestamp(
                      item.address,
                      tokenId,
                      1 + i,
                    )
                    let [month, year] = await stakingStrategy.currentPeriod()

                    await time.increaseTo(nextClaimTimestamp)

                    const blT = (
                      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
                    ).timestamp
                    console.log(`current date ${blT} ${new Date(blT * 1000).toUTCString()}`)

                    const earnings = 1000
                    await stakingStrategy.updateDeposits()
                    await stakingStrategy.connect(productOwner).setEarnings(month, year, earnings)
                    const balanceBefore = await token.balanceOf(user.address)
                    await stakingStrategy.connect(user).claim(item.address, tokenId, token.address)
                    const balanceAfter = await token.balanceOf(user.address)
                    if (i < initialMonths) {
                      const estimatedRewards = await treasury.usdAmountToToken(
                        tokenPrice.mul(initialRewardsRate).div(10000),
                        token.address,
                      )
                      assert(
                        balanceAfter.sub(balanceBefore).eq(estimatedRewards),
                        `flex first rewards ${balanceAfter.sub(
                          balanceBefore,
                        )} != ${estimatedRewards}`,
                      )
                    } else {
                      const remainder = await stakingStrategy.remainder(item.address, tokenId)
                      let deposits = await stakingStrategy.deposits(year, month)
                      const price = i == initialMonths ? tokenPrice.sub(remainder) : tokenPrice

                      const estimatedRewards = await treasury.usdAmountToToken(
                        price.mul(10000).mul(earnings).div(deposits).div(10000),
                        token.address,
                      )

                      assert(
                        balanceAfter.sub(balanceBefore).eq(estimatedRewards),
                        `flex rewards ${balanceAfter.sub(balanceBefore)} != ${estimatedRewards}`,
                      )
                    }
                  }

                  console.log(
                    `rewards ${await stakingStrategy.estimateRewards(item.address, tokenId)}`,
                  )

                  await stakingStrategy.updateDeposits()
                  let balanceBefore = await token.balanceOf(user.address)
                  console.log('aw1')
                  await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
                  console.log('aw12')
                  let balanceAfter = await token.balanceOf(user.address)

                  const deprecationRate = await stakingStrategy.yearDeprecationRate()
                  const estimatedBalance = await treasury.usdAmountToToken(
                    tokenPrice.sub(tokenPrice.mul(deprecationRate).mul(minLockYears).div(10000)),
                    token.address,
                  )
                  assert(
                    balanceAfter.sub(balanceBefore).eq(estimatedBalance),
                    `sell balance ${balanceAfter.sub(balanceBefore)} != ${estimatedBalance}`,
                  )

                  await expect(
                    stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                  ).to.be.revertedWith('ERC721: invalid token ID')
                  await expect(
                    stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                  ).to.be.revertedWith('ERC721: invalid token ID')
                })
              }
            })
          }
        })
      }
    })
  }
})
