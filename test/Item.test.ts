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
import { CHAINLINK_LINK_USD, ELCT, LINK, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { BigNumber } from 'ethers'

const TEST_DATA = {
  tokens: [
    USDT, //
    ELCT,
  ],
  items: [
    'MopedItem', //
    'MopedSparePartItem',
  ],
  stakingStrategies: [
    'TwoYearsFixStakingStrategy',
    'ThreeYearsFixStakingStrategy',
    'FiveYearsFixStakingStrategy',
    'FiveYearsFlexStakingStrategy',
  ],
}

describe(`Items tests`, () => {
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture()

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  for (const tokenAddress of TEST_DATA.tokens) {
    describe(`Token: ${tokenAddress}`, () => {
      let token: IERC20Metadata
      let mintedPayTokensAmount: BigNumber
      beforeEach(async () => {
        token = IERC20Metadata__factory.connect(USDT, user)
        mintedPayTokensAmount = await ERC20Minter.mint(token.address, user.address, 10000000)
      })

      for (const stakingStrategyTag of TEST_DATA.stakingStrategies) {
        describe(`StakingStrategy: ${stakingStrategyTag}`, () => {
          let stakingStrategyAddress: string
          beforeEach(async () => {
            const StakingStrategyDeployment = await deployments.get(stakingStrategyTag)
            stakingStrategyAddress = StakingStrategyDeployment.address
          })

          for (const itemTag of TEST_DATA.items) {
            describe(`Item: ${itemTag}`, () => {
              let item: Item
              let itemPrice: BigNumber
              let maxSupply: BigNumber
              beforeEach(async () => {
                const StakingStrategyDeployment = await deployments.get(itemTag)
                item = Item__factory.connect(StakingStrategyDeployment.address, user)
                itemPrice = await item.price()
                maxSupply = await item.maxSupply()
                await token.connect(user).approve(item.address, mintedPayTokensAmount)
              })

              it(`Regular: mint.`, async () => {
                const tokenId = 0

                const balanceBefore = await item.balanceOf(user.address)
                await item.connect(user).mint(stakingStrategyAddress, token.address, '0x')
                const balanceAfter = await item.balanceOf(user.address)
                assert(
                  balanceAfter.sub(balanceBefore).eq(1),
                  `Error mint: balanceBefore=${balanceBefore}, balanceAfter=${balanceAfter}`,
                )

                const tokenStakingStrategy = await item.tokenStakingStrategy(tokenId)
                assert(
                  tokenStakingStrategy == stakingStrategyAddress,
                  `tokenStakingStrategy != stakingStrategyAddress, ${tokenStakingStrategy} != ${stakingStrategyAddress}`,
                )
              })

              it('Error: mint not authorized staking strategy', async () => {
                const fakeStakingStratgey = ethers.constants.AddressZero
                await expect(
                  item.connect(user).mint(fakeStakingStratgey, token.address, '0x'),
                ).to.be.revertedWith('only staking strategy!')
              })

              it('Error: mint with not supported payToken', async () => {
                const fakeTokenAddress = ethers.constants.AddressZero
                await expect(
                  item.connect(user).mint(stakingStrategyAddress, fakeTokenAddress, '0x'),
                ).to.be.revertedWith('Treasury: unknown token!')
              })

              it(`Regular: owner stop sell`, async () => {
                await item.connect(productOwner).stopSell()
                await expect(
                  item.connect(user).mint(stakingStrategyAddress, token.address, '0x'),
                ).to.be.revertedWith('maxSupply!')
              })

              it(`Regular: owner set new maxSupply`, async () => {
                const newMaxSupply = 10
                await item.connect(productOwner).setNewMaxSupply(newMaxSupply)
                const maxSupply = await item.maxSupply()
                assert(
                  maxSupply.eq(newMaxSupply),
                  `maxSupply != newMaxSupply, ${maxSupply} != ${newMaxSupply}`,
                )
              })

              it(`Error: user set max supply`, async () => {
                const newMaxSupply = 10
                await expect(item.connect(user).setNewMaxSupply(newMaxSupply)).to.be.revertedWith(
                  'only product owner!',
                )
              })

              it(`Error: user stop sell`, async () => {
                await expect(item.connect(user).stopSell()).to.be.revertedWith(
                  'only product owner!',
                )
              })

              it(`Error: user burn`, async () => {
                const tokenId = 0
                await item.connect(user).mint(stakingStrategyAddress, token.address, '0x')
                await expect(item.connect(user).burn(tokenId)).to.be.revertedWith(
                  'only staking strategy!',
                )
              })
            })
          }
        })
      }
    })
  }
})
