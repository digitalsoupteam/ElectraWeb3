import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  IERC20Metadata,
  IERC20Metadata__factory,
  Item,
  Item__factory,
  Treasury,
  Treasury__factory,
  FixStakingStrategy,
  FixStakingStrategy__factory,
} from '../typechain-types'
import { ELCT, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { BigNumber } from 'ethers'
import { time } from '@nomicfoundation/hardhat-network-helpers'

const TEST_DATA = {
  tokens: [
    // USDT, //
    ELCT,
  ],
  items: [
    'MopedItem',
    // 'MopedSparePartItem',
  ],
  mintedAmount: [
    1, //
    // 2,
    // 10,
  ],
  stakingStrategies: [
    'TwoYearsFixStakingStrategy',
    // 'ThreeYearsFixStakingStrategy',
    // 'FiveYearsFixStakingStrategy',
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

          for (const tokenAddress of TEST_DATA.tokens) {
            describe(`Token ${tokenAddress}`, () => {
              let token: IERC20Metadata
              let mintedPayTokensAmount: BigNumber

              beforeEach(async () => {
                console.log('aw1')
                token = IERC20Metadata__factory.connect(tokenAddress, user)
                console.log('aw12')
                mintedPayTokensAmount = await ERC20Minter.mint(token.address, user.address, 100000)
                console.log('aw13')
                await ERC20Minter.mint(token.address, treasury.address, 10000000) // deposit to treasury
                console.log('aw14')
                await token.connect(user).approve(item.address, mintedPayTokensAmount)
                console.log('aw15')
              })

              for (const mintAmount of TEST_DATA.mintedAmount) {
                describe(`mintAmount ${mintAmount}`, () => {
                  it(`Regular: claim every period.`, async () => {
                    let tokenId = 0

                    // Mint item
                    await item
                      .connect(user)
                      .mint(mintAmount, stakingStrategy.address, token.address, '0x')

                    // Check errors: initial actions, claim/sell
                    await expect(
                      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                    ).to.be.revertedWith('rewards!')
                    await expect(
                      stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                    ).to.be.revertedWith("can't sell!")

                    // Contracts params
                    const tokenURI = await item.tokenURI(tokenId)
                    const tokenPrice = await item.tokenPrice(tokenId)
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
                        stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                      ).to.be.revertedWith("can't sell!")
                      // Increase time
                      let nextClaimTimestamp = await stakingStrategy.claimTimestamp(
                        item.address,
                        tokenId,
                        i + 1,
                      )
                      await time.increaseTo(nextClaimTimestamp)
                      // Claim
                      let balanceBefore = await token.balanceOf(user.address)
                      await stakingStrategy
                        .connect(user)
                        .claim(item.address, tokenId, token.address)
                      let balanceAfter = await token.balanceOf(user.address)
                      let estimatedBalance = await treasury.usdAmountToToken(
                        rewardsRate.mul(1).mul(tokenPrice).div(12).div(10000).toString(),
                        token.address,
                      )
                      assert(
                        balanceAfter.sub(balanceBefore).eq(estimatedBalance),
                        `claimed balance! ${balanceAfter.sub(
                          balanceBefore,
                        )} != ${estimatedBalance}`,
                      )
                      console.log(
                        `rewards: ${ethers.utils.formatUnits(
                          estimatedBalance,
                          await token.decimals(),
                        )}`,
                      )
                    }

                    // Check errors
                    await expect(
                      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                    ).to.be.revertedWith('rewards!')
                    await time.increase(1 * 12 * 30 * 24 * 60 * 60)
                    await expect(
                      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                    ).to.be.revertedWith('rewards!')

                    // Sell
                    let balanceBefore = await token.balanceOf(user.address)
                    await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
                    let balanceAfter = await token.balanceOf(user.address)
                    const sellPrice = await treasury.usdAmountToToken(tokenPrice, token.address)
                    assert(
                      balanceAfter.sub(balanceBefore).eq(sellPrice),
                      `sell balance! ${balanceAfter.sub(balanceBefore)} != ${sellPrice}`,
                    )
                    console.log(
                      `sell: ${ethers.utils.formatUnits(sellPrice, await token.decimals())}`,
                    )

                    // Check errors after burn
                    await expect(
                      stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
                    ).to.be.revertedWith('ERC721: invalid token ID')

                    await expect(
                      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
                    ).to.be.revertedWith('ERC721: invalid token ID')
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
