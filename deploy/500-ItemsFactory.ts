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
  4424320527864418087924332236512672186
  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)
  await (await governance.setItemsFactory(deployment.address)).wait()

  await (await governance.addItem('SCOOTER', ethers.utils.parseUnits('1000', 18))).wait()
  await (await governance.addItem('SKATE', ethers.utils.parseUnits('2000', 18))).wait()
  await (await governance.addItem('MOPED', ethers.utils.parseUnits('3000', 18))).wait()
  await (await governance.addItem('CAR', ethers.utils.parseUnits('5000', 18))).wait()
}

deploy.tags = ['ItemsFactory']
deploy.dependencies = ['Governance', 'StakingPlatform']
export default deploy
