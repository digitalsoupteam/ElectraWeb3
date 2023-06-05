import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

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
      token: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
      pricer: '0x87ea38c9f24264ec1fff41b04ec94a97caf99941',
    }, // BUSD
    {
      token: '0x55d398326f99059ff775485246999027b3197955',
      pricer: '0xb97ad0e74fa7d920791e90258a6e2085088b4320',
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
          args: [items, lockPeriods, supportedTokens],
        },
      },
    },
  })
}

deploy.tags = ['RentStaking']
export default deploy
