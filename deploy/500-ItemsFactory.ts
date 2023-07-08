import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const GovernanceDeployment = await get('Governance')
  const StakingPlatformDeployment = await get('StakingPlatform')

  const deployment = await deploy('ItemsFactory', {
    contract: 'ItemsFactory',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            GovernanceDeployment.address, // _governance
            StakingPlatformDeployment.address, // _stakingPlatform
          ],
        },
      },
    },
  })
  
  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)
  await (await governance.setItemsFactory(deployment.address)).wait()

  await (await governance.addItem('SCOOTER', 1000)).wait()
  await (await governance.addItem('SCATE', 2000)).wait()
  await (await governance.addItem('MOPED', 3000)).wait()
  await (await governance.addItem('CAR', 5000)).wait()
}

deploy.tags = ['ItemsFactory']
deploy.dependencies = ['Governance', 'Item']
export default deploy
