import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const alreadyDeployed = await getOrNull('FixStakingStrategyImplementation') != null
  if(alreadyDeployed) return

  const deployment = await deploy('FixStakingStrategyImplementation', {
    contract: 'FixStakingStrategy',
    from: deployer.address,
  })
}

deploy.tags = ['FixStakingStrategyImplementation']
deploy.dependencies = ['MopedSparePartItem']
export default deploy
