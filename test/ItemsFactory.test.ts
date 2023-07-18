import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  Governance,
  Governance__factory,
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
  CHAINLINK_LINK_USD,
  CHAINLINK_USDT_USD,
  LINK,
  USDT,
} from '../constants/addresses'
import { BigNumber } from 'ethers'
import { pricerUpdater } from '../scripts/EltcPricerUpdater/pricerUpdater'
import ERC20Minter from './utils/ERC20Minter'
import { INITIAL_DATA } from './data/initialData'

describe(`ItemsFactory`, () => {
  let initSnapshot: string
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  let itemsFactory: ItemsFactory
  let items: Array<{
    name: string
    price: BigNumber
    id: number
  }>

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture(['ItemsFactory'])
    const ItemsFactoryDeployment = await deployments.get('ItemsFactory')

    itemsFactory = ItemsFactory__factory.connect(ItemsFactoryDeployment.address, productOwner)

    const items_ = await itemsFactory.items()
    for (let i = 0; i < items_.itemsIds_.length; i++) {
      items ??= []
      items.push({
        name: items_.itemsNames_[i],
        price: items_.prices_[i],
        id: items_.itemsIds_[i].toNumber(),
      })
    }

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it('Initial data test: items', async () => {
    assert(
      items.length == INITIAL_DATA.items.length,
      `items.length != INITIAL_DATA.items.length. ${items.length} != ${INITIAL_DATA.items.length}`,
    )

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      assert(
        item.id == INITIAL_DATA.items[i].id,
        `item.id != INITIAL_DATA.items[i].id. ${item.id} != ${INITIAL_DATA.items[i].id}`,
      )
      assert(
        item.price.eq(INITIAL_DATA.items[i].price),
        `item.price != INITIAL_DATA.items[i].price. ${item.price} != ${INITIAL_DATA.items[i].price}`,
      )
      assert(
        item.name == INITIAL_DATA.items[i].name,
        `item.name != INITIAL_DATA.items[i].name. ${item.name} != ${INITIAL_DATA.items[i].name}`,
      )
    }
  })

  it(`Error unit: add item not governance.`, async () => {
    const name = 'BOAT'
    const price = ethers.utils.parseUnits('10000', 18)
    await expect(itemsFactory.connect(user).addItem(name, price)).to.be.revertedWith(
      'GovernanceRole: not authorized!',
    )
  })

  it(`Error unit: setItemSellDisabled not governance.`, async () => {
    await expect(itemsFactory.connect(user).setItemSellDisabled(0, true)).to.be.revertedWith(
      'GovernanceRole: not authorized!',
    )
  })

  it(`Error unit: newItems not StakingFactory.`, async () => {
    const ids = [1]
    const amounts = [1]
    await expect(itemsFactory.connect(user).newItems(ids, amounts)).to.be.revertedWith(
      'StakingPlatformRole: not authorized!',
    )
  })

  const totalPriceCases = [
    {
      ids: [0],
      amounts: [1],
    },
    {
      ids: [1],
      amounts: [10],
    },
    {
      ids: [1, 0],
      amounts: [10, 1],
    },
    {
      ids: [0, 1, 2, 3],
      amounts: [10, 1, 1, 2],
    },
  ]
  for(const testCase of totalPriceCases) {
    it(`Regular unit: totalPrice. case: ${testCase}`, async () => {
      let calculatedTotalPrice = BigNumber.from("0")
      for(let i = 0; i < testCase.ids.length; i++) {
        const id = testCase.ids[i]
        const amount = testCase.amounts[i]
        const price = await itemsFactory.prices(id)
        calculatedTotalPrice = calculatedTotalPrice.add(price.mul(amount))
      }

      const totalPrice = await itemsFactory.totalPrice(testCase.ids, testCase.amounts)
      
      assert(
        totalPrice.eq(calculatedTotalPrice),
        `totalPrice != calculatedTotalPrice. ${totalPrice} != ${calculatedTotalPrice}`,
      )
    })
  }
})
