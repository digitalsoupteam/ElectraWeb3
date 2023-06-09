import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { BNB_PLACEHOLDER, BUSD, CHAINLINK_BNB_USD, CHAINLINK_BUSD_USD, CHAINLINK_USDT_USD, USDT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const items = [
    {
      name: 'electric scooter',
      price: 1000,
    },
    {
      name: 'electric moped',
      price: 1000,
    },
    {
      name: 'electric bike',
      price: 1000,
    },
    {
      name: 'electric car',
      price: 1000,
    },
  ]

  const lockPeriods = [
    {
      lockTime: 1,
      rewardsRate: 1000,
    },
    {
      lockTime: 2,
      rewardsRate: 2000,
    },
    {
      lockTime: 3,
      rewardsRate: 2500,
    },
  ]

  const supportedTokens = [
    {
      token: BNB_PLACEHOLDER,
      pricer: CHAINLINK_BNB_USD,
    }, // BUSD
    {
      token: BUSD,
      pricer: CHAINLINK_BUSD_USD,
    }, // BUSD
    {
      token: USDT,
      pricer: CHAINLINK_USDT_USD,
    }, // USDT
  ]

  const deployment = await deploy('RentStaking', {
    contract: 'RentStaking',
    from: deployer.address,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            'RentStaking', // _nftName
            'RentStaking', // _nftSymbol
            items, // _items
            lockPeriods,  // _lockPeriods
            supportedTokens, // _supportedTokens
          ],
        },
      },
    },
  })
}

deploy.tags = ['RentStaking']
export default deploy
