import { deployments, ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC20Metadata__factory, RentStaking, RentStaking__factory } from '../typechain-types'
import { BNB_PLACEHOLDER, BUSD, USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { ContractReceipt, ContractTransaction } from 'ethers'
import { expect  } from 'chai'
import { ContractReceiptUtils } from './utils/ContractReceiptUtils'



const inputTokens = [
  // BNB_PLACEHOLDER,
  BUSD,
  // USDT
]


describe(`RentStaking`, () => {
  let rentStaking: RentStaking

  let initSnapshot: string

  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress

  before(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    user1 = accounts[8]
    user2 = accounts[9]

    await deployments.fixture([
      'RentStaking',
    ])
    const RentStakingDeployment = await deployments.get('RentStaking')

    rentStaking = RentStaking__factory.connect(RentStakingDeployment.address, owner)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  // it('Regular unit', async () => {
  //   console.log(await rentStaking.getItemsWithPrice())
  //   console.log(await rentStaking.getLockPeriodsWithRewardsRates())
  //   console.log(await rentStaking.getSupportedTokens())
  // })

  for(const inputToken of inputTokens) {
    it(`Regular unit inputToken=${inputToken}`, async () => {
      const user = user1
      const slippage = 10; // 10%
      const inputTokenAmount = await ERC20Minter.mint(inputToken, user.address, 20000)
    
      const itemsWithPrice = await rentStaking.getItemsWithPrice()
      const lockPeriodsWithRewardsRates = await rentStaking.getLockPeriodsWithRewardsRates()

      for(const itemWithPrice of itemsWithPrice) {
        for(const lockPeriodWithRewardsRate of lockPeriodsWithRewardsRates) {


          console.log(`item ${itemWithPrice.name}`)
          console.log(`lockPeriodWithRewardsRate ${lockPeriodWithRewardsRate.lockTime}`)
          const nextTokenId = await rentStaking.nextTokenId()

          const buyPriceByToken = await rentStaking.getBuyPriceByToken(itemWithPrice.name, inputToken)
          const buyPriceWithSlippage = buyPriceByToken.mul(100 + slippage).div(100)
          let txBuy: ContractTransaction;
          let receiptBuy: ContractReceipt;
          if(inputToken == BNB_PLACEHOLDER) {
            txBuy = await rentStaking.connect(user).buy(itemWithPrice.name, lockPeriodWithRewardsRate.lockTime, inputToken, {value: buyPriceWithSlippage});
            receiptBuy = await txBuy.wait()
          } else {
            const token = IERC20Metadata__factory.connect(inputToken, user)
            const txApprove = await token.approve(rentStaking.address, buyPriceWithSlippage)
            await txApprove.wait()
            txBuy = await rentStaking.connect(user).buy(itemWithPrice.name, lockPeriodWithRewardsRate.lockTime, inputToken);
            receiptBuy = await txBuy.wait()
          }

          const eventStep1 = ContractReceiptUtils.getEvent(
            receiptBuy.events,
            rentStaking,
            rentStaking.filters.Buy(),
          )
          console.log( 'eventStep1.args')
          console.log( eventStep1.args)

          await expect(txBuy).to.emit(rentStaking, 'Buy').withArgs(
            user.address, // recipeint,
            nextTokenId, // tokenId
          )
        }
      }

  

    })
  }
})