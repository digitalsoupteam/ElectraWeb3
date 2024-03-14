import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  IERC20Metadata__factory,
  Item,
  Item__factory,
  Treasury,
  Treasury__factory,
  FixStakingStrategy,
  FixStakingStrategy__factory,
} from '../typechain-types'
import { BNB_PLACEHOLDER, USDT, WBNB } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { BigNumber } from 'ethers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { balanceOf, decimals } from './utils/token'

const TEST_DATA = {
  tokens: [
    { tokenAddress: BNB_PLACEHOLDER, mintedAmount: 1000 },
    { tokenAddress: WBNB, mintedAmount: 1000 },
    { tokenAddress: USDT, mintedAmount: 100000 },
    { tokenAddress: 'ELCT', mintedAmount: 1000000 },
  ],
  items: [
    'MopedItem', //
    'MopedSparePartItem',
  ],
  stakingStrategies: [
    'TwoYearsFixStakingStrategy',
    'ThreeYearsFixStakingStrategy',
    'FiveYearsFixStakingStrategy',
  ],
}

describe(`FixStakingStratgey`, () => {
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

  for (const stakingStrategyTag of TEST_DATA.stakingStrategies) {
    describe(`Staking strategy ${stakingStrategyTag}`, () => {
      let stakingStrategy: FixStakingStrategy

      beforeEach(async () => {
        const StakingStrategyDeployment = await deployments.get(stakingStrategyTag)
        stakingStrategy = FixStakingStrategy__factory.connect(
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

          for (let { tokenAddress, mintedAmount } of TEST_DATA.tokens) {
            describe(`Token ${tokenAddress}`, () => {
              let mintedPayTokensAmount: BigNumber

              beforeEach(async () => {
                tokenAddress = ethers.utils.isAddress(tokenAddress)
                  ? tokenAddress
                  : (await deployments.get(tokenAddress)).address
                mintedPayTokensAmount = await ERC20Minter.mint(
                  tokenAddress,
                  user.address,
                  mintedAmount,
                )
                await ERC20Minter.mint(tokenAddress, treasury.address, mintedAmount * 10) // deposit to treasury
                if (tokenAddress != BNB_PLACEHOLDER) {
                  await IERC20Metadata__factory.connect(tokenAddress, user)
                    .connect(user)
                    .approve(item.address, mintedPayTokensAmount)
                }
              })

              it(`Regular: claim every period.`, async () => {
                let tokenId = 0

                // Mint item
                const tokenAmount = await treasury.usdAmountToToken(
                  await item.price(),
                  tokenAddress,
                )
                if (tokenAddress == BNB_PLACEHOLDER) {
                  await item
                    .connect(user)
                    .mint(1,
                      stakingStrategy.address,
                      tokenAddress,
                      ethers.constants.MaxUint256,
                      '0x',
                      {
                        value: tokenAmount,
                      },
                    )
                } else {
                  await item
                    .connect(user)
                    .mint(1,stakingStrategy.address, tokenAddress, ethers.constants.MaxUint256, '0x')
                }

                // Check errors: initial actions, claim/sell
                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('not has rewards!')
                await expect(
                  stakingStrategy.connect(user).sell(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith("can't sell!")

                // Contracts params
                const tokenURI = await item.tokenURI(tokenId)
                const tokenPrice = await item.price()
                const rewardsRate = await stakingStrategy.rewardsRate()
                const lockYears = (await stakingStrategy.lockYears()).toNumber()

                console.log(`tokenURI ${tokenURI}`)
                console.log(`tokenPrice ${tokenPrice}`)
                console.log(`rewardsRate ${rewardsRate}`)
                console.log(`lockYears ${lockYears}`)

                for (let i = 0; i < 12 * lockYears; i++) {
                  console.log(`-> Period: ${i}`)
                  // Check errors sell
                  await expect(
                    stakingStrategy.connect(user).sell(item.address, tokenId, tokenAddress, 0),
                  ).to.be.revertedWith("can't sell!")
                  // Increase time
                  let nextClaimTimestamp = await stakingStrategy.claimTimestamp(
                    item.address,
                    tokenId,
                    i + 1,
                  )
                  await time.increaseTo(nextClaimTimestamp)
                  // Claim
                  let balanceBefore = await balanceOf(tokenAddress, user.address)
                  await stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0)
                  let balanceAfter = await balanceOf(tokenAddress, user.address)
                  let estimatedBalance = await treasury.usdAmountToToken(
                    rewardsRate.mul(1).mul(tokenPrice).div(12).div(10000).toString(),
                    tokenAddress,
                  )
                  assert(
                    balanceAfter.sub(balanceBefore).gt(estimatedBalance.mul(9).div(10)) &&
                      balanceAfter.sub(balanceBefore).lt(estimatedBalance.mul(11).div(10)),
                    `claimed balance! ${balanceAfter.sub(balanceBefore)} != ${estimatedBalance}`,
                  )
                  console.log(
                    `rewards: ${ethers.utils.formatUnits(
                      estimatedBalance,
                      await decimals(tokenAddress),
                    )}`,
                  )
                }

                // Check errors
                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('not has rewards!')
                await time.increase(1 * 12 * 30 * 24 * 60 * 60)
                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('not has rewards!')

                // Sell
                let balanceBefore = await balanceOf(tokenAddress, user.address)
                await stakingStrategy.connect(user).sell(item.address, tokenId, tokenAddress, 0)
                let balanceAfter = await balanceOf(tokenAddress, user.address)
                const sellPrice = await treasury.usdAmountToToken(tokenPrice, tokenAddress)
                assert(
                  balanceAfter.sub(balanceBefore).gt(sellPrice.mul(9).div(10)) &&
                    balanceAfter.sub(balanceBefore).lt(sellPrice.mul(11).div(10)),
                  `sell balance! ${balanceAfter.sub(balanceBefore)} != ${sellPrice}`,
                )
                console.log(
                  `sell: ${ethers.utils.formatUnits(sellPrice, await decimals(tokenAddress))}`,
                )

                // Check errors after burn
                await expect(
                  stakingStrategy.connect(user).sell(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('ERC721: invalid token ID')

                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('ERC721: invalid token ID')
              })

              it(`Regular: claim all periods.`, async () => {
                let tokenId = 0

                // Mint item

                const tokenAmount = await treasury.usdAmountToToken(
                  await item.price(),
                  tokenAddress,
                )
                if (tokenAddress == BNB_PLACEHOLDER) {
                  await item
                    .connect(user)
                    .mint(1,
                      stakingStrategy.address,
                      tokenAddress,
                      ethers.constants.MaxUint256,
                      '0x',
                      {
                        value: tokenAmount,
                      },
                    )
                } else {
                  await item
                    .connect(user)
                    .mint(1,stakingStrategy.address, tokenAddress, ethers.constants.MaxUint256, '0x')
                }

                // Check errors: initial actions, claim/sell
                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('not has rewards!')
                await expect(
                  stakingStrategy.connect(user).sell(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith("can't sell!")

                // Contracts params
                const tokenPrice = await item.price()
                const rewardsRate = await stakingStrategy.rewardsRate()
                const lockYears = (await stakingStrategy.lockYears()).toNumber()

                // Increase time
                let nextClaimTimestamp = await stakingStrategy.claimTimestamp(
                  item.address,
                  tokenId,
                  lockYears * 12,
                )
                await time.increaseTo(nextClaimTimestamp)
                // Claim
                let balanceBefore = await balanceOf(tokenAddress, user.address)
                await stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0)
                let balanceAfter = await balanceOf(tokenAddress, user.address)
                let estimatedBalance = await treasury.usdAmountToToken(
                  rewardsRate
                    .mul(lockYears * 12)
                    .mul(tokenPrice)
                    .div(12)
                    .div(10000)
                    .toString(),
                  tokenAddress,
                )

                assert(
                  balanceAfter.sub(balanceBefore).gt(estimatedBalance.mul(9).div(10)) &&
                    balanceAfter.sub(balanceBefore).lt(estimatedBalance.mul(11).div(10)),
                  `claimed balance! ${balanceAfter.sub(balanceBefore)} != ${estimatedBalance}`,
                )
                console.log(
                  `rewards: ${ethers.utils.formatUnits(
                    estimatedBalance,
                    await decimals(tokenAddress),
                  )}`,
                )

                // Check errors
                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('not has rewards!')
                await time.increase(1 * 12 * 30 * 24 * 60 * 60)
                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('not has rewards!')

                // Sell
                let sellBalanceBefore = await balanceOf(tokenAddress, user.address)
                await stakingStrategy.connect(user).sell(item.address, tokenId, tokenAddress, 0)
                let sellBalanceAfter = await balanceOf(tokenAddress, user.address)
                const sellPrice = await treasury.usdAmountToToken(tokenPrice, tokenAddress)
                assert(
                  sellBalanceAfter.sub(sellBalanceBefore).gt(sellPrice.mul(9).div(10)) &&
                    sellBalanceAfter.sub(sellBalanceBefore).lt(sellPrice.mul(11).div(10)),
                  `sell balance! ${sellBalanceAfter.sub(sellBalanceBefore)} != ${sellPrice}`,
                )
                console.log(
                  `sell: ${ethers.utils.formatUnits(sellPrice, await decimals(tokenAddress))}`,
                )

                // Check errors after burn
                await expect(
                  stakingStrategy.connect(user).sell(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('ERC721: invalid token ID')

                await expect(
                  stakingStrategy.connect(user).claim(item.address, tokenId, tokenAddress, 0),
                ).to.be.revertedWith('ERC721: invalid token ID')
              })
            })
          }
        })
      }
    })
  }
})
