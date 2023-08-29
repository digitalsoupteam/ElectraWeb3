import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  IERC20Metadata,
  IERC20Metadata__factory,
  IPricer__factory,
  Treasury,
  Treasury__factory,
  Item,
  Item__factory,
} from '../typechain-types'
import { CHAINLINK_LINK_USD, LINK, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { INITIAL_DATA } from './data/initialData'
import { BigNumber } from 'ethers'

const TEST_DATA = {
  tokens: [USDT],
  items: [
    'ScooterItem',
    // 'BikeItem',
    // 'MopedItem',
    // 'CarItem',
  ],
  stakingStrategies: [
    'TwoYearsFixStakingStrategy',
    // 'ThreeYearsFixStakingStrategy',
    // 'FiveYearsFixStakingStrategy',
    // 'FiveYearsFlexStakingStrategy',
  ],
}

describe(`Items tests`, () => {
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress

  before(async () => {
    console.log('Root before')
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture()

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    console.log('Root after each')
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  for (const tokenAddress of TEST_DATA.tokens) {
    describe(`Token: ${tokenAddress}`, () => {
      let token: IERC20Metadata
      let mintedPayTokensAmount: BigNumber
      beforeEach(async () => {
        console.log('Token before')
        token = IERC20Metadata__factory.connect(USDT, user)
        mintedPayTokensAmount = await ERC20Minter.mint(token.address, user.address, 100000)
      })

      for (const stakingStrategyTag of TEST_DATA.stakingStrategies) {
        describe(`StakingStrategy: ${stakingStrategyTag}`, () => {
          let stakingStrategyAddress: string
          beforeEach(async () => {
            console.log('StakingStrategy before')
            const StakingStrategyDeployment = await deployments.get(stakingStrategyTag)
            stakingStrategyAddress = StakingStrategyDeployment.address
          })

          for (const itemTag of TEST_DATA.items) {
            describe(`Item: ${itemTag}`, () => {
              let item: Item
              let itemPrice: BigNumber
              let maxSupply: BigNumber
              beforeEach(async () => {
                console.log('Item before')
                const StakingStrategyDeployment = await deployments.get(itemTag)
                item = Item__factory.connect(StakingStrategyDeployment.address, user)
                itemPrice = await item.price()
                maxSupply = await item.maxSupply()
                await token.connect(user).approve(item.address, mintedPayTokensAmount)
              })

              for(const amount of [1,2,3]) {
                it('Regular: mint', async () => {
                  const tokenId = 0;
  
                  const balanceBefore = await item.balanceOf(user.address)
                  await item.mint(amount, stakingStrategyAddress, token.address, '0x')
                  const balanceAfter = await item.balanceOf(user.address)
                  assert(balanceAfter.sub(balanceBefore).eq(1), `Error mint: balanceBefore=${balanceBefore}, balanceAfter=${balanceAfter}`)
  
                  const amountInToken = await item.amountInToken(tokenId)
                  assert(amountInToken.eq(amount), `amountInToken != amount, ${amountInToken} != ${amount}`)
                  
                  const tokenStakingStrategy = await item.tokenStakingStrategy(tokenId)
                  assert(tokenStakingStrategy == stakingStrategyAddress, `tokenStakingStrategy != stakingStrategyAddress, ${tokenStakingStrategy} != ${stakingStrategyAddress}`)
                })
              }
            })
          }
        })
      }
    })
  }
})
