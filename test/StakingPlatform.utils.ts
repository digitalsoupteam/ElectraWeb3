import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import {
  IERC20Metadata__factory,
  IItemsFactory,
  IStakingPlatform,
  ITreasury,
  StakingPlatform,
} from '../typechain-types'
import { BNB_PLACEHOLDER } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'

export async function getCurrentRound(stakingPlatform: StakingPlatform) {
  return await stakingPlatform.getRound(await getTimestamp())
}

export async function getTimestamp() {
  const blockNumber = await ethers.provider.getBlockNumber()
  const block = await ethers.provider.getBlock(blockNumber)
  return block.timestamp
}

export async function setTimeToNextMonday() {
  const timestamp = await getTimestamp()

  let date = new Date(timestamp * 1000)
  date.setSeconds(0)
  date.setMinutes(0)
  date.setHours(0)

  let weekDay = date.getDay()
  weekDay = weekDay == 0 ? 7 : weekDay + 1

  await time.increaseTo(Math.floor(date.getTime() / 1000) + (8 - weekDay + 5) * 24 * 60 * 60)
}

export async function stakeItem(stakingPlatform, user, item, rewardsStrategy, token) {
  if (token == BNB_PLACEHOLDER) {
    await stakingPlatform
      .connect(user)
      .stakeItem(item, rewardsStrategy, token, { value: ethers.utils.parseUnits('100', 18) })
  } else {
    const amount = await ERC20Minter.mint(token, user.address, 100)
    await IERC20Metadata__factory.connect(token, user).approve(stakingPlatform.address, amount)
    await stakingPlatform.connect(user).stakeItem(item, rewardsStrategy, token)
  }
}

export async function stakeItems(
  stakingPlatform: IStakingPlatform,
  user: SignerWithAddress,
  itemsIds: number[],
  itemsAmount: number[],
  rewardsStrategy: string,
  payToken: string,
  tokensAmountWithSlippage: BigNumber
) {
  if (payToken == BNB_PLACEHOLDER) {
    return await stakingPlatform
      .connect(user)
      .stakeItems(itemsIds, itemsAmount, rewardsStrategy, payToken, {
        value: tokensAmountWithSlippage,
      })
  } else {
    await IERC20Metadata__factory.connect(payToken, user).approve(stakingPlatform.address, tokensAmountWithSlippage)
    return await stakingPlatform.connect(user).stakeItems(itemsIds, itemsAmount, rewardsStrategy, payToken)
  }
}

export async function tokenBalance(account: string, token: string): Promise<BigNumber> {
  if (token == BNB_PLACEHOLDER) return await ethers.provider.getBalance(account);
  return await IERC20Metadata__factory.connect(token, ethers.provider).balanceOf(account)
}

export async function tokenDecimals(token: string): Promise<number> {
  if (token == BNB_PLACEHOLDER) return 18
  return await IERC20Metadata__factory.connect(token, ethers.provider).decimals()
}
