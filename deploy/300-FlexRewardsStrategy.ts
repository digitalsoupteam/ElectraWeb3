import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory, StakingPlatform__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const GovernanceDeployment = await get('Governance')
  const StakingPlatformDeployment = await get('StakingPlatform')

  const deployment = await deploy('FlexRewardsStrategy', {
    contract: 'FlexRewardsStrategy',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            GovernanceDeployment.address, // _governance,
            StakingPlatformDeployment.address, // _stakingPlatform,
          ],
        },
      },
    },
  })

  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)
  await (await governance.addRewardsStrategy(deployment.address)).wait()
}

deploy.tags = ['FlexRewardsStrategy']
deploy.dependencies = ['Governance', 'StakingPlatform']
export default deploy
