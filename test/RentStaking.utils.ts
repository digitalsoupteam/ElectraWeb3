import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC20Metadata__factory, RentStaking } from '../typechain-types'
import {
  BNB_PLACEHOLDER,
} from '../constants/addresses'
import { BigNumber, ContractTransaction } from 'ethers'

export class RentStakingTestUtils {
  static async balanceOf(account: string, token: string) {
    if (token == BNB_PLACEHOLDER) {
      return await ethers.provider.getBalance(account)
    } else {
      return await IERC20Metadata__factory.connect(token, ethers.provider).balanceOf(account)
    }
  }

  static async decimals(token: string) {
    if (token == BNB_PLACEHOLDER) {
      return 18
    } else {
      return await IERC20Metadata__factory.connect(token, ethers.provider).decimals()
    }
  }

  static async buy(
    rentStaking: RentStaking,
    inputToken: string,
    itemWithPrice: {name: string, price: number},
    lockPeriodWithRewardsRate:  {lockTime: number, rewardsRate: number},
    user: SignerWithAddress,
    buyPrice: BigNumber,
  ): Promise<ContractTransaction> {
    if (inputToken == BNB_PLACEHOLDER) {
      return rentStaking
        .connect(user)
        .buy(itemWithPrice.name, lockPeriodWithRewardsRate.lockTime, inputToken, {
          value: buyPrice,
        })
    } else {
      const token = IERC20Metadata__factory.connect(inputToken, user)
      const txApprove = await token.approve(rentStaking.address, buyPrice)
      await txApprove.wait()
      return rentStaking
        .connect(user)
        .buy(itemWithPrice.name, lockPeriodWithRewardsRate.lockTime, inputToken)
    }
  }

  static async deposit(
    rentStaking: RentStaking,
    owner: SignerWithAddress,
    inputToken: string,
    depositAmount: BigNumber,
  ): Promise<ContractTransaction> {
    if (inputToken == BNB_PLACEHOLDER) {
      return rentStaking.deposit(inputToken, depositAmount, { value: depositAmount })
    } else {
      const token = IERC20Metadata__factory.connect(inputToken, owner)
      const txDepositApprove = await token.approve(rentStaking.address, depositAmount)
      await txDepositApprove.wait()
      return rentStaking.deposit(inputToken, depositAmount)
    }
  }

  static async compareBalances(
    token: string,
    balanceBefore: BigNumber,
    balanceAfter: BigNumber,
    resultBalance: BigNumber,
  ) {
    if (token == BNB_PLACEHOLDER) {
      const slippage = 2 // 2%
      return balanceAfter.sub(balanceBefore).gte(resultBalance.mul(100 + slippage).div(100))
    } else {
      return balanceAfter.sub(balanceBefore).eq(resultBalance)
    }
  }
}
