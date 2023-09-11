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
                xit(`Regular: claim every period (min lock). mintAmount=${mintAmount}`, async () => {
                  await time.increase((31 + 30 + 22) * 24 * 60 * 60)

                  let tokenId = 1

                  const token = IERC20Metadata__factory.connect(tokenAddress, user)
                  await ERC20Minter.mint(token.address, treasury.address, 1000000)
                  const usdtAmount = await ERC20Minter.mint(token.address, user.address, 100000)

                  await token.approve(item.address, usdtAmount)
                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  await time.increase(60 * 24 * 60 * 60)
                  await item.connect(user).mint(mintAmount, stakingStrategy.address, token.address, '0x')

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

                    const earnings = 1000
                    await stakingStrategy.connect(productOwner).updateDeposits()
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

                  await stakingStrategy.connect(productOwner).updateDeposits()
                  let balanceBefore = await token.balanceOf(user.address)
                  await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
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

                xit(`Regular: claim all in one (min lock). mintAmount=${mintAmount}`, async () => {
                  await time.increase((31 + 30 + 22) * 24 * 60 * 60)

                  let tokenId = 1

                  const token = IERC20Metadata__factory.connect(tokenAddress, user)
                  await ERC20Minter.mint(token.address, treasury.address, 1000000)
                  const usdtAmount = await ERC20Minter.mint(token.address, user.address, 100000)

                  await token.approve(item.address, usdtAmount)
                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  await time.increase(60 * 24 * 60 * 60)
                  await item.connect(user).mint(mintAmount, stakingStrategy.address, token.address, '0x')

                  await expect(
                    stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                  ).to.be.revertedWith('rewards!')

                  const tokenPrice = await item.tokenPrice(tokenId)
                  const initialMonths = (await stakingStrategy.initialMonths()).toNumber()
                  const initialRewardsRate = await stakingStrategy.initialRewardsRate()

                  const minLockYears = (await stakingStrategy.minLockYears()).toNumber()
                  let estimatedRewards: BigNumber = BigNumber.from('0')
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

                    const earnings = 1000
                    await stakingStrategy.connect(productOwner).updateDeposits()
                    await stakingStrategy.connect(productOwner).setEarnings(month, year, earnings)

                    if (i < initialMonths) {
                      estimatedRewards = estimatedRewards.add(
                        await treasury.usdAmountToToken(
                          tokenPrice.mul(initialRewardsRate).div(10000),
                          token.address,
                        ),
                      )
                    } else {
                      const remainder = await stakingStrategy.remainder(item.address, tokenId)
                      let deposits = await stakingStrategy.deposits(year, month)
                      const price = i == initialMonths ? tokenPrice.sub(remainder) : tokenPrice

                      estimatedRewards = estimatedRewards.add(
                        await treasury.usdAmountToToken(
                          price.mul(10000).mul(earnings).div(deposits).div(10000),
                          token.address,
                        ),
                      )
                    }
                  }

                  let balanceBefore = await token.balanceOf(user.address)
                  await stakingStrategy.connect(user).claim(item.address, tokenId, token.address)
                  let balanceAfter = await token.balanceOf(user.address)

                  assert(
                    balanceAfter.sub(balanceBefore).eq(estimatedRewards),
                    `flex rewards ${balanceAfter.sub(balanceBefore)} != ${estimatedRewards}`,
                  )

                  await stakingStrategy.connect(productOwner).updateDeposits()
                  balanceBefore = await token.balanceOf(user.address)
                  await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
                  balanceAfter = await token.balanceOf(user.address)

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

                xit(`Regular: claim every period (max lock). mintAmount=${mintAmount}`, async () => {
                  await time.increase((31 + 30 + 22) * 24 * 60 * 60)

                  let tokenId = 1

                  const token = IERC20Metadata__factory.connect(tokenAddress, user)
                  await ERC20Minter.mint(token.address, treasury.address, 1000000)
                  const usdtAmount = await ERC20Minter.mint(token.address, user.address, 100000)

                  await token.approve(item.address, usdtAmount)
                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  await time.increase(60 * 24 * 60 * 60)

                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  await expect(
                    stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                  ).to.be.revertedWith('rewards!')

                  const tokenPrice = await item.tokenPrice(tokenId)
                  const initialMonths = (await stakingStrategy.initialMonths()).toNumber()
                  const initialRewardsRate = await stakingStrategy.initialRewardsRate()

                  const minLockYears = (await stakingStrategy.minLockYears()).toNumber()
                  const maxLockYears = (await stakingStrategy.maxLockYears()).toNumber()
                  for (let i = 0; i < 12 * maxLockYears + 1; i++) {
                    console.log(`i ${i}`)
                    if (i < 12 * minLockYears) {
                      await expect(
                        stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                      ).to.be.revertedWith("can't sell!")
                    }

                    let nextClaimTimestamp = await stakingStrategy.nextClaimTimestamp(
                      item.address,
                      tokenId,
                      1 + i,
                    )
                    let [month, year] = await stakingStrategy.currentPeriod()

                    await time.increaseTo(nextClaimTimestamp)

                    const earnings = 1000
                    await stakingStrategy.connect(productOwner).updateDeposits()
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
                      let price = tokenPrice
                      if(i == initialMonths) price = tokenPrice.sub(remainder);
                      else if(i == 12 * maxLockYears) price = remainder;

                      const estimatedRewards = await treasury.usdAmountToToken(
                        price.mul(10000).mul(earnings).div(deposits).div(10000),
                        token.address,
                      )

                      assert(
                        balanceAfter.sub(balanceBefore).eq(estimatedRewards),
                        `flex rewards i=${i} ${balanceAfter.sub(balanceBefore)} != ${estimatedRewards}`,
                      )
                    }
                  }
                  // return

                  console.log('aw1')

                  await stakingStrategy.connect(productOwner).updateDeposits()
                  console.log('aw12')
                  let balanceBefore = await token.balanceOf(user.address)
                  console.log('aw13')
                  await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
                  console.log('aw14')
                  let balanceAfter = await token.balanceOf(user.address)

                  console.log('aw15')
                  const deprecationRate = await stakingStrategy.yearDeprecationRate()
                  console.log('aw16')
                  const estimatedBalance = await treasury.usdAmountToToken(
                    tokenPrice.sub(tokenPrice.mul(deprecationRate).mul(maxLockYears).div(10000)),
                    token.address,
                  )
                  console.log('aw17')
                  assert(
                    balanceAfter.sub(balanceBefore).eq(estimatedBalance),
                    `sell balance ${balanceAfter.sub(balanceBefore)} != ${estimatedBalance}`,
                  )

                  console.log('aw18')
                  await expect(
                    stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                  ).to.be.revertedWith('ERC721: invalid token ID')
                  console.log('aw19')
                  await expect(
                    stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                  ).to.be.revertedWith('ERC721: invalid token ID')
                  console.log('aw110')
                })

                it(`Regular: claim all in one (max lock). mintAmount=${mintAmount}`, async () => {
                  await time.increase((31 + 30 + 22) * 24 * 60 * 60)

                  let tokenId = 1

                  const token = IERC20Metadata__factory.connect(tokenAddress, user)
                  await ERC20Minter.mint(token.address, treasury.address, 1000000)
                  const usdtAmount = await ERC20Minter.mint(token.address, user.address, 100000)

                  await token.approve(item.address, usdtAmount)
                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  await time.increase(60 * 24 * 60 * 60)
                  await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

                  await expect(
                    stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                  ).to.be.revertedWith('rewards!')

                  const tokenPrice = await item.tokenPrice(tokenId)
                  const initialMonths = (await stakingStrategy.initialMonths()).toNumber()
                  const initialRewardsRate = await stakingStrategy.initialRewardsRate()

                  const minLockYears = (await stakingStrategy.minLockYears()).toNumber()
                  const maxLockYears = (await stakingStrategy.maxLockYears()).toNumber()
                  let estimatedRewards: BigNumber = BigNumber.from('0')
                  for (let i = 0; i < 12 * maxLockYears; i++) {
                    if (i < 12 * minLockYears) {
                      await expect(
                        stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                      ).to.be.revertedWith("can't sell!")
                    }
                    let nextClaimTimestamp = await stakingStrategy.nextClaimTimestamp(
                      item.address,
                      tokenId,
                      1 + i,
                    )
                    let [month, year] = await stakingStrategy.currentPeriod()

                    await time.increaseTo(nextClaimTimestamp)

                    const earnings = 1000
                    await stakingStrategy.connect(productOwner).updateDeposits()
                    await stakingStrategy.connect(productOwner).setEarnings(month, year, earnings)
                   
                    if (i < initialMonths) {
                      estimatedRewards = estimatedRewards.add(
                        await treasury.usdAmountToToken(
                          tokenPrice.mul(initialRewardsRate).div(10000),
                          token.address,
                        ),
                      )
                    } else {
                      const remainder = await stakingStrategy.remainder(item.address, tokenId)
                      let deposits = await stakingStrategy.deposits(year, month)
                      let price = tokenPrice
                      if(i == initialMonths) price = tokenPrice.sub(remainder);
                      else if(i == 12 * maxLockYears) price = remainder;

                      estimatedRewards = estimatedRewards.add(
                        await treasury.usdAmountToToken(
                          price.mul(10000).mul(earnings).div(deposits).div(10000),
                          token.address,
                        ),
                      )
                    }
                  }

                  let balanceBefore = await token.balanceOf(user.address)
                  await stakingStrategy.connect(user).claim(item.address, tokenId, token.address)
                  let balanceAfter = await token.balanceOf(user.address)

                  console.log(`claim ${balanceAfter.sub(balanceBefore)}`)

                  assert(
                    balanceAfter.sub(balanceBefore).eq(estimatedRewards),
                    `flex rewards ${balanceAfter.sub(balanceBefore)} != ${estimatedRewards}`,
                  )

                  await stakingStrategy.connect(productOwner).updateDeposits()
                  balanceBefore = await token.balanceOf(user.address)
                  await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
                  balanceAfter = await token.balanceOf(user.address)

                  console.log(`sell ${balanceAfter.sub(balanceBefore)}`)
                  const deprecationRate = await stakingStrategy.yearDeprecationRate()
                  const estimatedBalance = await treasury.usdAmountToToken(
                    tokenPrice.sub(tokenPrice.mul(deprecationRate).mul(maxLockYears).div(10000)),
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
