import axios from 'axios'
import { ethers, network } from 'hardhat'
import { IERC20Metadata__factory } from '../../typechain-types'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { BigNumber } from 'ethers'
import { BNB_PLACEHOLDER, BUSD, LINK, USDT } from '../../constants/addresses'

export default class ERC20Minter {
  public static async mint(
    tokenAddress: string,
    recipient: string,
    maxAmountFormated?: number,
  ): Promise<BigNumber> {
    if (tokenAddress == BNB_PLACEHOLDER) {
      return ethers.utils.parseUnits(`${maxAmountFormated}`, 18)
    }

    const holders = {
        [BUSD]: '0x56306851238d7aee9fac8cdd6877e92f83d5924c',
        [USDT]: '0xd183f2bbf8b28d9fec8367cb06fe72b88778c86b',
        [LINK]: '0x21d45650db732ce5df77685d6021d7d5d1da807f'
    }

    const holderAddress = holders[tokenAddress]
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [holderAddress],
    })
    const holder = await ethers.getSigner(holderAddress)

    await setBalance(holderAddress, ethers.utils.parseEther('0.1'))

    const token = IERC20Metadata__factory.connect(tokenAddress, holder)
    const tokenDecimals = await token.decimals()
    const amount = ethers.utils.parseUnits(`${maxAmountFormated}`, tokenDecimals)

    const holderBalance = await token.balanceOf(holderAddress)

    const balanceBefore = await token.balanceOf(recipient)

    if (holderBalance.gte(amount)) {
      await (await token.transfer(recipient, amount)).wait()
    } else {
      await (await token.transfer(recipient, holderBalance)).wait()
    }

    const balanceAfter = await token.balanceOf(recipient)

    return balanceAfter.sub(balanceBefore)
  }
}
