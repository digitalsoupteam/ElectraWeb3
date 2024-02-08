import { ethers } from "hardhat"
import { IERC20Metadata__factory } from "../../typechain-types"
import { BNB_PLACEHOLDER } from "../../constants/addresses"

export async function decimals(token: string) {
    if(token == BNB_PLACEHOLDER) return 18
    return IERC20Metadata__factory.connect(token, ethers.provider).decimals()
  }
  
  
  export  async function balanceOf(token: string, account: string) {
    if(token == BNB_PLACEHOLDER) return ethers.provider.getBalance(account)
    return IERC20Metadata__factory.connect(token, ethers.provider).balanceOf(account)
  }