import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  IERC20Metadata__factory,
  Treasury,
  IItem__factory,
  FixStakingStrategy__factory,
} from '../typechain-types'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import ERC20Minter from './utils/ERC20Minter'

export class FixStakingTestUtils {
  static async test({
    treasury,
    tokenAddress,
    itemTag,
    stakingStrategyTag,
    user,
  }: {
    treasury: Treasury
    tokenAddress: string
    itemTag: string
    stakingStrategyTag: string
    user: SignerWithAddress
  }) {
    let tokenId = 0

    // Deps
    const ItemDeployment = deployments.get(itemTag)
    const DeploymentStakingStrategy = deployments.get(stakingStrategyTag)
    const item = IItem__factory.connect((await ItemDeployment).address, user)
    const stakingStrategy = FixStakingStrategy__factory.connect(
      (await DeploymentStakingStrategy).address,
      user,
    )
    const token = IERC20Metadata__factory.connect(tokenAddress, user)

    // Pay token
    await ERC20Minter.mint(token.address, treasury.address, 1000000)
    const usdtAmount = await ERC20Minter.mint(token.address, user.address, 100000)
    await token.approve(item.address, usdtAmount)

    // Mint item
    await item.connect(user).mint(1, stakingStrategy.address, token.address, '0x')

    // Check errors: initial actions, claim/sell
    await expect(
      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
    ).to.be.revertedWith('rewards!')
    await expect(
      stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
    ).to.be.revertedWith("can't sell!")

    // Contracts params
    const tokenPrice = await item.tokenPrice(tokenId)
    const rewardsRate = await stakingStrategy.rewardsRate()
    const lockYears = (await stakingStrategy.lockYears()).toNumber()

    // Increase time
    let nextClaimTimestamp = await stakingStrategy.nextClaimTimestamp(
      item.address,
      tokenId,
      12 * lockYears,
    )
    await time.increaseTo(nextClaimTimestamp)

    // Claim for all time
    let balanceBefore = await token.balanceOf(user.address)
    await stakingStrategy.connect(user).claim(item.address, tokenId, token.address)
    let balanceAfter = await token.balanceOf(user.address)
    let estimatedBalance = ethers.utils.parseUnits(
      rewardsRate.mul(lockYears).mul(tokenPrice).div(10000).toString(),
      await token.decimals(),
    )
    assert(
      balanceAfter.sub(balanceBefore).eq(estimatedBalance),
      `claimed balance! ${balanceAfter.sub(balanceBefore)} != ${estimatedBalance}`,
    )

    // Check errors
    await expect(
      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
    ).to.be.revertedWith('rewards!')
    await time.increase(1 * 12 * 30 * 24 * 60 * 60)
    await expect(
      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
    ).to.be.revertedWith('rewards!')

    // Sell
    balanceBefore = await token.balanceOf(user.address)
    await stakingStrategy.connect(user).sell(item.address, tokenId, token.address)
    balanceAfter = await token.balanceOf(user.address)
    const sellPrice = await treasury.usdAmountToToken(tokenPrice, token.address)
    assert(
      balanceAfter.sub(balanceBefore).eq(sellPrice),
      `sell balance! ${balanceAfter.sub(balanceBefore)} != ${sellPrice}`,
    )

    // Check errors after burn
    await expect(
      stakingStrategy.connect(user).sell(item.address, tokenId, token.address),
    ).to.be.revertedWith('ERC721: invalid token ID')

    await expect(
      stakingStrategy.connect(user).claim(item.address, tokenId, token.address),
    ).to.be.revertedWith('ERC721: invalid token ID')
  }
}
