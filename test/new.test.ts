import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  AddressBook,
  AddressBook__factory,
  Governance,
  Governance__factory,
  IERC20Metadata,
  IERC20Metadata__factory,
  IPricer__factory,
  Treasury,
  Treasury__factory,
  Item,
  Item__factory,
  IStakingStrategy,
  IStakingStrategy__factory,
  IItem__factory,
  FlexStakingStrategy__factory,
  FixStakingStrategy__factory,
  FlexStakingStrategy,
} from '../typechain-types'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import {
  getCurrentRound,
  getTimestamp,
  setTimeToNextMonday,
  stakeItems,
  tokenBalance,
  tokenDecimals,
  tokenTransfer,
} from './StakingPlatform.utils'
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
import { BigNumber } from 'ethers'
import ERC20Minter from './utils/ERC20Minter'
import { INITIAL_DATA } from './data/initialData'

const TEST_DATA = {
  tokens: [
    // BNB_PLACEHOLDER,
    // BUSD,
    USDT,
  ],
  items: [
    '0x9b3c40545bf8b9a44a003a81d0dbc67d5841175d', // SCT
    '0xc5f14627a22f8f19e79a4f7cfa3802dbc48d2473', // BKE
    '0x6f3d61b3843e775caf42da95e344ee0046cd19ad', // MPD
    '0xc35b15f8f7588ed34dd7c19339d3ba421fc8b1fc', // CAR
  ],
  fixStakingStrategies: [
    '0xedf68694f6e6cee33cdb4cf1e7c43a3e9046b011', // TwoYearsFixStakingStrategy
    '0xb67b8206a2341c4527d1103dbb195f9369160961', // ThreeYearsFixStakingStrategy
    '0xb9f55d5bf46c6dbc6c178c3173b92384a98504c0', // FiveYearsFixStakingStrategy
  ],
  flexStakingStrategies: [
    '0x313722181698b822e252d25f4fe453a7bb4c6846', // FlexStakingStrategy
  ],
}

describe(`New`, () => {
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  let governance: Governance
  let treasury: Treasury
  let addressBook: AddressBook
  let items: Item[] = []

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture()

    const GovernanceDeployment = await deployments.get('Governance')
    const TreasuryDeployment = await deployments.get('Treasury')

    governance = Governance__factory.connect(GovernanceDeployment.address, productOwner)
    treasury = Treasury__factory.connect(TreasuryDeployment.address, productOwner)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  for (const tokenAddress of TEST_DATA.tokens) {
    for (const itemAddress of TEST_DATA.items) {
      for (const stakingStrategyAddress of TEST_DATA.fixStakingStrategies) {
        it(`Regular fix token=${tokenAddress} item=${itemAddress} strategy=${stakingStrategyAddress}`, async () => {
          let tokenId = 0
          const item = IItem__factory.connect(itemAddress, productOwner)
          const stakingStrategy = FixStakingStrategy__factory.connect(
            stakingStrategyAddress,
            productOwner,
          )
          const token = IERC20Metadata__factory.connect(tokenAddress, user)
          await ERC20Minter.mint(token.address, treasury.address, 1000000)
          const usdtAmount = await ERC20Minter.mint(token.address, user.address, 100000)

          await token.approve(item.address, usdtAmount)
          await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

          await expect(
            stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
          ).to.be.revertedWith('rewards!')

          const tokenPrice = await item.tokenPrice(tokenId)
          const rewardsRate = await stakingStrategy.rewardsRate()
          const lockYears = (await stakingStrategy.lockYears()).toNumber()

          let balanceBefore = await token.balanceOf(user.address)

          await expect(
            stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
          ).to.be.revertedWith("can't sell!")
          let nextClaimTimestamp = await stakingStrategy.nextClaimTimestamp(
            itemAddress,
            tokenId,
            12 * lockYears,
          )

          await time.increaseTo(nextClaimTimestamp)
          await stakingStrategy.connect(user).claim(item.address, tokenId, token.address)
          await expect(
            stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
          ).to.be.revertedWith('rewards!')


          await time.increase(1 * 12 * 30 * 24 * 60 * 60)
          await expect(
            stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
          ).to.be.revertedWith('rewards!')


          let balanceAfter = await token.balanceOf(user.address)
          let estimatedBalance = ethers.utils.parseUnits(
            rewardsRate.mul(lockYears).mul(tokenPrice).div(10000).toString(),
            await token.decimals(),
          )

          assert(
            balanceAfter.sub(balanceBefore).eq(estimatedBalance),
            `claimed balance! ${balanceAfter.sub(balanceBefore)} != ${estimatedBalance}`,
          )

          balanceBefore = await token.balanceOf(user.address)
          await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)

          balanceAfter = await token.balanceOf(user.address)
          const sellPrice = await treasury.usdAmountToToken(tokenPrice, token.address)
          assert(
            balanceAfter.sub(balanceBefore).eq(sellPrice),
            `sell balance! ${balanceAfter.sub(balanceBefore)} != ${sellPrice}`,
          )

          await expect(
            stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
          ).to.be.revertedWith('ERC721: invalid token ID')

          await expect(
            stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
          ).to.be.revertedWith('ERC721: invalid token ID')
        })
      }

      for (const stakingStrategyAddress of TEST_DATA.flexStakingStrategies) {
        it(`Regular min sell flex token=${tokenAddress} item=${itemAddress} strategy=${stakingStrategyAddress}`, async () => {
          let tokenId = 1
          const item = IItem__factory.connect(itemAddress, productOwner)
          const stakingStrategy: FlexStakingStrategy = FlexStakingStrategy__factory.connect(
            stakingStrategyAddress,
            productOwner,
          )

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
          for (let i = 0; i < 12 * minLockYears; i++) {
            await expect(
              stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
            ).to.be.revertedWith("can't sell!")
            let nextClaimTimestamp = await stakingStrategy.nextClaimTimestamp(
              itemAddress,
              tokenId,
              1,
            )
            let [month, year] = await stakingStrategy.currentPeriod()

            await time.increaseTo(nextClaimTimestamp)
            const earnings = 1000
            await stakingStrategy.updateDeposits()
            await governance.setFlexStrategyEarningsPeriod(
              stakingStrategyAddress,
              month,
              year,
              earnings,
            )
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
                `flex first rewards ${balanceAfter.sub(balanceBefore)} != ${estimatedRewards}`,
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

          let balanceBefore = await token.balanceOf(user.address)
          await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
          let balanceAfter = await token.balanceOf(user.address)

          const deprecationRate = await stakingStrategy.yearDeprecationRate()
          const estimatedBalance = await treasury.usdAmountToToken(tokenPrice.sub(tokenPrice.mul(deprecationRate).mul( minLockYears).div(10000)), token.address)
          assert(
            balanceAfter
              .sub(balanceBefore)
              .eq(estimatedBalance),
            `sell balance ${balanceAfter.sub(balanceBefore)} != ${estimatedBalance}`,
          )

          await expect(
            stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
          ).to.be.revertedWith('ERC721: invalid token ID')
          await expect(
            stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
          ).to.be.revertedWith('ERC721: invalid token ID')
        })

        it(`Regular max sell flex token=${tokenAddress} item=${itemAddress} strategy=${stakingStrategyAddress}`, async () => {
          let tokenId = 1
          const item = IItem__factory.connect(itemAddress, productOwner)
          const stakingStrategy: FlexStakingStrategy = FlexStakingStrategy__factory.connect(
            stakingStrategyAddress,
            productOwner,
          )

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
          for (let i = 0; i < 12 * maxLockYears; i++) {
            if(i < 12 * minLockYears) {
              await expect(
                stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
              ).to.be.revertedWith("can't sell!")
            }
            let nextClaimTimestamp = await stakingStrategy.nextClaimTimestamp(
              itemAddress,
              tokenId,
              1,
            )
            let [month, year] = await stakingStrategy.currentPeriod()

            await time.increaseTo(nextClaimTimestamp)
            const earnings = 1000
            await stakingStrategy.updateDeposits()
            await governance.setFlexStrategyEarningsPeriod(
              stakingStrategyAddress,
              month,
              year,
              earnings,
            )
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
                `flex first rewards ${balanceAfter.sub(balanceBefore)} != ${estimatedRewards}`,
              )
            } else {
              const remainder = await stakingStrategy.remainder(item.address, tokenId)
              let deposits = await stakingStrategy.deposits(year, month)
              let price = tokenPrice
              if(i == initialMonths) price = tokenPrice.sub(remainder);
              else if(i == 12 * maxLockYears - 1) price = remainder

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

          let balanceBefore = await token.balanceOf(user.address)
          await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
          let balanceAfter = await token.balanceOf(user.address)

          const deprecationRate = await stakingStrategy.yearDeprecationRate()
          const estimatedBalance = await treasury.usdAmountToToken(tokenPrice.sub(tokenPrice.mul(deprecationRate).mul(maxLockYears).div(10000)), token.address)
          assert(
            balanceAfter
              .sub(balanceBefore)
              .eq(estimatedBalance),
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
    }
  }
})
