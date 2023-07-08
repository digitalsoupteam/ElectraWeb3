import { deployments, ethers } from 'hardhat'
import { assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC20Metadata, IERC20Metadata__factory, IRewardsStrategy, IRewardsStrategy__factory, ItemsFactory, ItemsFactory__factory, PricerToUSD, PricerToUSD__factory, StakingPlatform, StakingPlatform__factory, Treasury, Treasury__factory } from '../typechain-types'
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { getCurrentRound, getTimestamp, setTimeToNextMonday } from './StakingPlatform.utils';

describe(`StakingPlatform`, () => {
  let stakingPlatform: StakingPlatform
  let itemsFactory: ItemsFactory
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  // let items: Item[]
  let rewardsStrategies: IRewardsStrategy[]
  let treasury: Treasury
  let tokens: IERC20Metadata[]

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture(['StakingPlatform', 'ItemsFactory', 'Treasury', 'StableRewardsStrategy', 'FlexRewardsStrategy'])
    const StakingPlatformDeployment = await deployments.get('StakingPlatform')
    const ItemsFactoryDeployment = await deployments.get('ItemsFactory')
    const TreasuryDeployment = await deployments.get('Treasury')

    stakingPlatform = StakingPlatform__factory.connect(StakingPlatformDeployment.address, productOwner)
    itemsFactory = ItemsFactory__factory.connect(ItemsFactoryDeployment.address, productOwner)
    treasury = Treasury__factory.connect(TreasuryDeployment.address, productOwner)

    // items = (await itemsFactory.items()).map(address => Item__factory.connect(address, productOwner))
    rewardsStrategies = (await stakingPlatform.rewardsStrategies()).map(address => IRewardsStrategy__factory.connect(address, productOwner))
    tokens = (await treasury.tokens()).map(address => IERC20Metadata__factory.connect(address, productOwner))

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it('Regular unit', async () => {

    console.log(`currentRound ${await getCurrentRound(stakingPlatform)}`)


    // const item = items[0].address
    const itemsIds = [0]
    const itemsAmount = [1]
    const rewardsStrategy = rewardsStrategies[0].address
    const token = tokens[0].address
    await stakingPlatform.connect(user).stakeItems(itemsIds, itemsAmount, rewardsStrategy, token, {value: ethers.utils.parseUnits('100', 18)});

    // await setTimeToNextMonday();
    // console.log(`nextRound ${await getCurrentRound(stakingPlatform)}`)
    // await setTimeToNextMonday();
    // console.log(`nextRound ${await getCurrentRound(stakingPlatform)}`)
    // await setTimeToNextMonday();
    // console.log(`nextRound ${await getCurrentRound(stakingPlatform)}`)
    // await setTimeToNextMonday();
    // console.log(`nextRound ${await getCurrentRound(stakingPlatform)}`)
    // await setTimeToNextMonday();
    // console.log(`nextRound ${await getCurrentRound(stakingPlatform)}`)
    // await setTimeToNextMonday();
    // console.log(`nextRound ${await getCurrentRound(stakingPlatform)}`)



  })
})
