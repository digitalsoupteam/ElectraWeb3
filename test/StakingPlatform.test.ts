import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  IERC20Metadata,
  IERC20Metadata__factory,
  IPricer__factory,
  IRewardsStrategy,
  IRewardsStrategy__factory,
  ITreasury__factory,
  ItemsFactory,
  ItemsFactory__factory,
  PricerToUSD,
  PricerToUSD__factory,
  StakingPlatform,
  StakingPlatform__factory,
  Treasury,
  Treasury__factory,
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
  CHAINLINK_USDT_USD,
  USDT,
} from '../constants/addresses'
import { BigNumber } from 'ethers'
import { pricerUpdater } from '../scripts/EltcPricerUpdater/pricerUpdater'
import ERC20Minter from './utils/ERC20Minter'
import { INITIAL_DATA } from './data/initialData'

const CONFIG = {
  strategies: [
    {
      name: 'FLEX',
      roundInOnePeriod: 4,
    },
    {
      name: 'STABLE',
      roundInOnePeriod: 4,
    },
  ],
  tokens: [
    {
      address: BNB_PLACEHOLDER,
      pricer: CHAINLINK_BNB_USD,
    },
    {
      address: BUSD,
      pricer: CHAINLINK_BUSD_USD,
    },
    {
      address: USDT,
      pricer: CHAINLINK_USDT_USD,
    },
  ],
  items: [
    {
      id: 0,
      name: 'SCOOTER',
      price: ethers.utils.parseUnits('1000', 18),
    },
    {
      id: 1,
      name: 'SKATE',
      price: ethers.utils.parseUnits('2000', 18),
    },
    {
      id: 2,
      name: 'MOPED',
      price: ethers.utils.parseUnits('3000', 18),
    },
    {
      id: 3,
      name: 'CAR',
      price: ethers.utils.parseUnits('5000', 18),
    },
  ],
}

describe(`StakingPlatform`, () => {
  let stakingPlatform: StakingPlatform
  let itemsFactory: ItemsFactory
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  let items: Array<{
    name: string
    price: BigNumber
    id: number
  }>
  let rewardsStrategies: IRewardsStrategy[]
  let treasury: Treasury
  let tokens: IERC20Metadata[]

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture([
      'StakingPlatform',
      'ItemsFactory',
      'Treasury',
      'StableRewardsStrategy',
      'FlexRewardsStrategy',
    ])
    const StakingPlatformDeployment = await deployments.get('StakingPlatform')
    const ItemsFactoryDeployment = await deployments.get('ItemsFactory')
    const TreasuryDeployment = await deployments.get('Treasury')

    stakingPlatform = StakingPlatform__factory.connect(
      StakingPlatformDeployment.address,
      productOwner,
    )
    itemsFactory = ItemsFactory__factory.connect(ItemsFactoryDeployment.address, productOwner)
    treasury = Treasury__factory.connect(TreasuryDeployment.address, productOwner)

    const items_ = await itemsFactory.items()
    for (let i = 0; i < items_.itemsIds_.length; i++) {
      items ??= []
      items.push({
        name: items_.itemsNames_[i],
        price: items_.prices_[i],
        id: items_.itemsIds_[i].toNumber(),
      })
    }

    rewardsStrategies = (await stakingPlatform.rewardsStrategies()).map(address =>
      IRewardsStrategy__factory.connect(address, productOwner),
    )
    tokens = (await treasury.tokens()).map(address =>
      IERC20Metadata__factory.connect(address, productOwner),
    )

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  // it('Initial data test: strategies', async () => {
  //   assert(rewardsStrategies.length == CONFIG.strategies.length, `rewardsStrategies.length != CONFIG.strategies.length. ${rewardsStrategies.length} != ${CONFIG.strategies.length}`)

  //   for(let i = 0; i < rewardsStrategies.length; i++) {
  //     const rewardsStrategy = rewardsStrategies[i]
  //     const name = await rewardsStrategy.name()
  //     assert(name == CONFIG.strategies[i].name, `name != CONFIG.strategies[i].name. ${name} != ${CONFIG.strategies[i].name}`)
  //   }
  // })

  // for (const token of CONFIG.tokens) {
  //   for (const strategy of CONFIG.strategies) {
  //     for (const item of CONFIG.items) {
  //       it(`Regular unit: stake single item. token = ${JSON.stringify(
  //         token,
  //       )}; strategy = ${JSON.stringify(strategy)}; item = ${JSON.stringify(item)};`, async () => {
  //         const itemsIds = [item.id]
  //         const itemsAmounts = [1]
  //         const rewardsStrategy = await stakingPlatform.rewardsStrategiesByName(strategy.name)
  //         const tokenAddress = token.address
  //         const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //         const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //         const slippage = 10
  //         const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)
  //         await ERC20Minter.mint(tokenAddress, user.address, 100000)
  //         const treasuryBalanceBefore = await tokenBalance(treasury.address, tokenAddress)
  //         const userBalanceBefore = await tokenBalance(user.address, tokenAddress)
  //         await stakeItems(stakingPlatform, user, itemsIds, itemsAmounts, rewardsStrategy, tokenAddress, tokensAmountWithSlippage)
  //         const userBalanceAfter =  await tokenBalance(user.address, tokenAddress)
  //         assert(
  //           userBalanceAfter.gt(userBalanceBefore.sub(tokensAmountWithSlippage)),
  //           `Stake not return change! ${userBalanceAfter} > ${userBalanceBefore} - ${tokensAmountWithSlippage} (${userBalanceBefore.sub(
  //             tokensAmountWithSlippage,
  //           )})`,
  //         )
  //         const treasureBalanceAfter = await tokenBalance(treasury.address, tokenAddress)
  //         assert(
  //           treasureBalanceAfter.eq(treasuryBalanceBefore.add(tokensAmount)),
  //           `treasureBalanceAfter != treasuryBalanceBefore + tokensAmount . ${treasureBalanceAfter} != ${treasuryBalanceBefore} + ${tokensAmount} (${treasuryBalanceBefore.add(
  //             tokensAmount,
  //           )})`,
  //         )
  //       })
  //     }

  //     const cases = [
  //       {
  //         itemsIds: [0, 1],
  //         itemsAmounts: [1, 1],
  //       },
  //       {
  //         itemsIds: [0, 1, 3],
  //         itemsAmounts: [10, 1, 7],
  //       },
  //       {
  //         itemsIds: [2, 0],
  //         itemsAmounts: [3, 3],
  //       },
  //     ]
  //     for (const testCase of cases) {
  //         it(`Regular unit: stake multiply item. token = ${JSON.stringify(
  //           token,
  //         )}; strategy = ${JSON.stringify(strategy)}; case = ${JSON.stringify(
  //           testCase,
  //         )};`, async () => {
  //           const itemsIds = testCase.itemsIds
  //           const itemsAmounts = testCase.itemsAmounts
  //           const rewardsStrategy = await stakingPlatform.rewardsStrategiesByName(strategy.name)
  //           const tokenAddress = token.address
  //           const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //           const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //           const slippage = 10
  //           const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)
  //           await ERC20Minter.mint(tokenAddress, user.address, 100000)
  //           const treasuryBalanceBefore = await tokenBalance(treasury.address, tokenAddress)
  //           const userBalanceBefore = await tokenBalance(user.address, tokenAddress)
  //           await stakeItems(
  //             stakingPlatform,
  //             user,
  //             itemsIds,
  //             itemsAmounts,
  //             rewardsStrategy,
  //             tokenAddress,
  //             tokensAmountWithSlippage,
  //           )
  //           const userBalanceAfter = await tokenBalance(user.address, tokenAddress)
  //           assert(
  //             userBalanceAfter.gt(userBalanceBefore.sub(tokensAmountWithSlippage)),
  //             `Stake not return change! ${userBalanceAfter} > ${userBalanceBefore} - ${tokensAmountWithSlippage} (${userBalanceBefore.sub(
  //               tokensAmountWithSlippage,
  //             )})`,
  //           )
  //           const treasureBalanceAfter = await tokenBalance(treasury.address, tokenAddress)
  //           assert(
  //             treasureBalanceAfter.eq(treasuryBalanceBefore.add(tokensAmount)),
  //             `treasureBalanceAfter != treasuryBalanceBefore + tokensAmount . ${treasureBalanceAfter} != ${treasuryBalanceBefore} + ${tokensAmount} (${treasuryBalanceBefore.add(
  //               tokensAmount,
  //             )})`,
  //           )
  //         })
  //     }
  //   }
  // }

  // it(`Error unit: stake duplicate item`, async () => {
  //   const itemsIds = [0, 1, 0]
  //   const itemsAmounts = [1, 1, 1]
  //   const rewardsStrategy = rewardsStrategies[0].address
  //   const tokenAddress = tokens[0].address

  //   const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //   const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)

  //   const slippage = 10

  //   const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

  //   await ERC20Minter.mint(tokenAddress, user.address, 100000)

  //   const txPromise = stakeItems(
  //     stakingPlatform,
  //     user,
  //     itemsIds,
  //     itemsAmounts,
  //     rewardsStrategy,
  //     tokenAddress,
  //     tokensAmountWithSlippage,
  //   )
  //   await expect(txPromise).to.be.revertedWith('StakingPlatform: duplicate item id!')
  // })

  // it(`Error unit: stake zero amount`, async () => {
  //   const itemsIds = [0, 1]
  //   const itemsAmounts = [1, 0]
  //   const rewardsStrategy = rewardsStrategies[0].address
  //   const tokenAddress = tokens[0].address
  //   const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //   const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //   const slippage = 10
  //   const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

  //   await ERC20Minter.mint(tokenAddress, user.address, 100000)

  //   const txPromise = stakeItems(
  //     stakingPlatform,
  //     user,
  //     itemsIds,
  //     itemsAmounts,
  //     rewardsStrategy,
  //     tokenAddress,
  //     tokensAmountWithSlippage,
  //   )
  //   await expect(txPromise).to.be.revertedWith('StakingPlatform: zero item amount!')
  // })

  // it(`Error unit: stake empty items`, async () => {
  //   const itemsIds = []
  //   const itemsAmounts = []
  //   const rewardsStrategy = rewardsStrategies[0].address
  //   const tokenAddress = tokens[0].address
  //   const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //   const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //   const slippage = 10
  //   const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

  //   await ERC20Minter.mint(tokenAddress, user.address, 100000)

  //   const txPromise = stakeItems(
  //     stakingPlatform,
  //     user,
  //     itemsIds,
  //     itemsAmounts,
  //     rewardsStrategy,
  //     tokenAddress,
  //     tokensAmountWithSlippage,
  //   )
  //   await expect(txPromise).to.be.revertedWith('ItemsFactory: empty items list!')
  // })

  // it(`Error unit: stake itemsIds.length != itemsAmounts.length`, async () => {
  //   const itemsIds = [1]
  //   const itemsAmounts = [1, 1]
  //   const rewardsStrategy = rewardsStrategies[0].address
  //   const tokenAddress = tokens[0].address
  //   const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //   const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //   const slippage = 10
  //   const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

  //   await ERC20Minter.mint(tokenAddress, user.address, 100000)

  //   const txPromise = stakeItems(
  //     stakingPlatform,
  //     user,
  //     itemsIds,
  //     itemsAmounts,
  //     rewardsStrategy,
  //     tokenAddress,
  //     tokensAmountWithSlippage,
  //   )
  //   await expect(txPromise).to.be.revertedWith('ERC1155: ids and amounts length mismatch')
  // })

  // for(const token of INITIAL_DATA.tokens) {
  //   it(`Error unit: stake not funds. token ${token.address}`, async () => {
  //     const itemsIds = [1]
  //     const itemsAmounts = [1]
  //     const rewardsStrategy = rewardsStrategies[0].address
  //     const tokenAddress = token.address
  //     const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //     const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //     const slippage = 10
  //     const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

  //     await ERC20Minter.mint(tokenAddress, user.address, 100000)

  //     try {
  //       await stakeItems(
  //         stakingPlatform,
  //         user,
  //         itemsIds,
  //         itemsAmounts,
  //         rewardsStrategy,
  //         tokenAddress,
  //         tokensAmountWithSlippage.div(2),
  //       )
  //       assert(false, "stake items without balance")
  //     } catch(e){}
  //   })
  // }

  // it(`Error unit: addRewardsStrategy not governance.`, async () => {
  //   await expect(
  //     stakingPlatform.connect(user).addRewardsStrategy(ethers.constants.AddressZero),
  //   ).to.be.revertedWith('GovernanceRole: not authorized!')
  // })

  // it(`Regular unit: sell 2 years`, async () => {
  //   const itemsIds = [1]
  //   const itemsAmounts = [1]
  //   const rewardsStrategy = rewardsStrategies[0].address
  //   const tokenAddress = INITIAL_DATA.tokens[0].address
  //   const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //   const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //   const slippage = 10
  //   const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

  //   await ERC20Minter.mint(tokenAddress, user.address, 100000)

  //   await stakeItems(
  //     stakingPlatform,
  //     user,
  //     itemsIds,
  //     itemsAmounts,
  //     rewardsStrategy,
  //     tokenAddress,
  //     tokensAmountWithSlippage,
  //   )

  //   for(let i = 0; i < 105; i++) {
  //     await setTimeToNextMonday()
  //   }

  //   const stakingsBalanceBefore = await stakingPlatform.balanceOf(user.address)
  //   const balanceBefore = await tokenBalance(user.address, tokenAddress)

  //   await stakingPlatform.connect(user).sellItems(0, tokenAddress)

  //   const stakingsBalanceAfter = await stakingPlatform.balanceOf(user.address)
  //   const balanceAfter = await tokenBalance(user.address, tokenAddress)

  //   assert(balanceAfter.gt(balanceBefore), 'Not wthdrawn tokens')
  //   assert(stakingsBalanceBefore.eq(stakingsBalanceAfter), 'staking counts fail')

  //   const stakingInfo = await stakingPlatform.connect(user).stakingsInfo(0)

  //   assert(stakingInfo.freezed == true, "Not freezed staking");
  // })

 it(`Regular unit: sell 2.5 years`, async () => {
    const itemsIds = [1]
    const itemsAmounts = [1]
    const rewardsStrategy = rewardsStrategies[0].address
    const tokenAddress = INITIAL_DATA.tokens[0].address
    const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
    const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
    const slippage = 10
    const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

    await ERC20Minter.mint(tokenAddress, user.address, 100000)

    await stakeItems(
      stakingPlatform,
      user,
      itemsIds,
      itemsAmounts,
      rewardsStrategy,
      tokenAddress,
      tokensAmountWithSlippage,
    )

    for(let i = 0; i < 105 + 26; i++) {
      await setTimeToNextMonday()
    }

    const stakingsBalanceBefore = await stakingPlatform.balanceOf(user.address)
    const balanceBefore = await tokenBalance(user.address, tokenAddress)

    await stakingPlatform.connect(user).sellItems(0, tokenAddress)

    const stakingsBalanceAfter = await stakingPlatform.balanceOf(user.address)
    const balanceAfter = await tokenBalance(user.address, tokenAddress)

    assert(balanceAfter.gt(balanceBefore), 'Not wthdrawn tokens')
    assert(stakingsBalanceBefore.eq(stakingsBalanceAfter), 'staking counts fail')

    const stakingInfo = await stakingPlatform.connect(user).stakingsInfo(0)

    assert(stakingInfo.freezed == true, "Not freezed staking");
  })

  it(`Regular unit: sell 5 years`, async () => {
    const itemsIds = [1]
    const itemsAmounts = [1]
    const rewardsStrategy = rewardsStrategies[0].address
    const tokenAddress = INITIAL_DATA.tokens[0].address
    const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
    const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
    const slippage = 10
    const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

    await ERC20Minter.mint(tokenAddress, user.address, 100000)

    await stakeItems(
      stakingPlatform,
      user,
      itemsIds,
      itemsAmounts,
      rewardsStrategy,
      tokenAddress,
      tokensAmountWithSlippage,
    )

    for(let i = 0; i < 105 + 52 * 4; i++) {
      await setTimeToNextMonday()
    }

    const stakingsBalanceBefore = await stakingPlatform.balanceOf(user.address)
    const balanceBefore = await tokenBalance(user.address, tokenAddress)

    await stakingPlatform.connect(user).sellItems(0, tokenAddress)

    const stakingsBalanceAfter = await stakingPlatform.balanceOf(user.address)
    const balanceAfter = await tokenBalance(user.address, tokenAddress)

    assert(balanceAfter.gt(balanceBefore), 'Not wthdrawn tokens')
    assert(stakingsBalanceBefore.eq(stakingsBalanceAfter), 'staking counts fail')

    const stakingInfo = await stakingPlatform.connect(user).stakingsInfo(0)

    assert(stakingInfo.freezed == true, "Not freezed staking");
  })

  
  it(`Regular unit: sell 6 years`, async () => {
    const itemsIds = [1]
    const itemsAmounts = [1]
    const rewardsStrategy = rewardsStrategies[0].address
    const tokenAddress = INITIAL_DATA.tokens[0].address
    const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
    const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
    const slippage = 10
    const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

    await ERC20Minter.mint(tokenAddress, user.address, 100000)

    await stakeItems(
      stakingPlatform,
      user,
      itemsIds,
      itemsAmounts,
      rewardsStrategy,
      tokenAddress,
      tokensAmountWithSlippage,
    )

    for(let i = 0; i < 105 + 52 * 5; i++) {
      await setTimeToNextMonday()
    }

    const stakingsBalanceBefore = await stakingPlatform.balanceOf(user.address)
    const balanceBefore = await tokenBalance(user.address, tokenAddress)

    await stakingPlatform.connect(user).sellItems(0, tokenAddress)

    const stakingsBalanceAfter = await stakingPlatform.balanceOf(user.address)
    const balanceAfter = await tokenBalance(user.address, tokenAddress)

    assert(balanceAfter.gt(balanceBefore), 'Not wthdrawn tokens')
    assert(stakingsBalanceBefore.eq(stakingsBalanceAfter), 'staking counts fail')

    console.log(`${balanceAfter.sub(balanceBefore)}`)

    const stakingInfo = await stakingPlatform.connect(user).stakingsInfo(0)

    assert(stakingInfo.freezed == true, "Not freezed staking");
  })

  // it(`Error unit: early sell (< 2 years)`, async () => {
  //   const itemsIds = [1]
  //   const itemsAmounts = [1]
  //   const rewardsStrategy = rewardsStrategies[0].address
  //   const tokenAddress = INITIAL_DATA.tokens[0].address
  //   const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
  //   const tokensAmount = await treasury.usdAmountToToken(totalPrice, tokenAddress)
  //   const slippage = 10
  //   const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

  //   await ERC20Minter.mint(tokenAddress, user.address, 100000)

  //   await stakeItems(
  //     stakingPlatform,
  //     user,
  //     itemsIds,
  //     itemsAmounts,
  //     rewardsStrategy,
  //     tokenAddress,
  //     tokensAmountWithSlippage,
  //   )

  //   for(let i = 0; i < 105; i++) {
  //     console.log(`round ${i}`)
  //     await expect(stakingPlatform.connect(user).sellItems(0, tokenAddress)).to.be.revertedWith("StakingPlatform: not has expired rounds to sell!")
  //     await setTimeToNextMonday()
  //   }
  // })

  return
  it('Regular unit', async () => {
    console.log(`currentRound ${await getCurrentRound(stakingPlatform)}`)

    // const item = items[0].address
    const itemsIds = [0, 1]
    const itemsAmounts = [1, 10]
    const rewardsStrategy = rewardsStrategies[1].address
    const token = tokens[0].address

    const totalPrice = await itemsFactory.totalPrice(itemsIds, itemsAmounts)
    const tokensAmount = await treasury.usdAmountToToken(totalPrice, token)

    const slippage = 10

    const tokensAmountWithSlippage = tokensAmount.mul(100 + slippage).div(100)

    const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address)
    const userBalanceBefore = await ethers.provider.getBalance(user.address)

    await stakingPlatform.connect(user).stakeItems(itemsIds, itemsAmounts, rewardsStrategy, token, {
      value: tokensAmountWithSlippage,
    })
    const userBalanceAfter = await ethers.provider.getBalance(user.address)
    assert(
      userBalanceAfter.gt(userBalanceBefore.sub(tokensAmountWithSlippage)),
      `Stake not return change! ${userBalanceAfter} > ${userBalanceBefore} - ${tokensAmountWithSlippage} (${userBalanceBefore.sub(
        tokensAmountWithSlippage,
      )})`,
    )

    const treasureBalanceAfter = await ethers.provider.getBalance(treasury.address)

    assert(
      treasureBalanceAfter.eq(treasuryBalanceBefore.add(tokensAmount)),
      `treasureBalanceAfter != treasuryBalanceBefore + tokensAmount . ${treasureBalanceAfter} != ${treasuryBalanceBefore} + ${tokensAmount} (${treasuryBalanceBefore.add(
        tokensAmount,
      )})`,
    )

    const stakingInfo = await stakingPlatform.connect(user).stakingsInfo(0)
    console.log(stakingInfo)

    for (let period = 0; period < 52; period++) {
      console.log(`period ${period}`)
      const currentRound = (await getCurrentRound(stakingPlatform)).toNumber()

      const roundInOnePeriod = (await rewardsStrategies[0].roundInOnePeriod()).toNumber()
      const nextRoundToClaim = stakingInfo.initialRound
        .add(period * roundInOnePeriod)
        .add(roundInOnePeriod)
        .toNumber()

      for (let round = currentRound; round < nextRoundToClaim; round++) {
        console.log(`round ${round} period ${period}`)
        await expect(
          stakingPlatform.connect(user).claimRewards(0, BNB_PLACEHOLDER),
        ).to.be.revertedWith('StakingPlatform: not has rounds to claim!')
        await setTimeToNextMonday()
      }

      console.log(`period ${period}`)
      await stakingPlatform.connect(user).claimRewards(0, BNB_PLACEHOLDER)
    }
  })
})
