import { ethers } from 'hardhat'
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { IERC20Metadata__factory, StakingPlatform } from '../typechain-types';
import { BNB_PLACEHOLDER } from '../constants/addresses';
import ERC20Minter from './utils/ERC20Minter';

export async function getCurrentRound(stakingPlatform: StakingPlatform) {
  return await stakingPlatform.getRound(await getTimestamp())
}

export async function getTimestamp() {
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  return block.timestamp
}

export async function setTimeToNextMonday() {
  const timestamp = await getTimestamp()

  let date = new Date(timestamp * 1000)
  date.setSeconds(0)
  date.setMinutes(0)
  date.setHours(0)

  let weekDay = date.getDay()
  weekDay = weekDay == 0 ? 7 : weekDay + 1;

  await time.increaseTo(Math.floor(date.getTime() / 1000) + (8 - weekDay + 5) * 24 * 60 * 60)
}

export async function stakeItem(stakingPlatform, user, item, rewardsStrategy, token) {
  if(token == BNB_PLACEHOLDER) {
    await stakingPlatform.connect(user).stakeItem(item, rewardsStrategy, token, {value: ethers.utils.parseUnits('100', 18)});
  } else {
    const amount = await ERC20Minter.mint(token, user.address, 100)
    await IERC20Metadata__factory.connect(token, user).approve(stakingPlatform.address, amount);
    await stakingPlatform.connect(user).stakeItem(item, rewardsStrategy, token);
  }
}