import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const deployment = await deploy('FlexStakingStrategyImplementation', {
    contract: 'FlexStakingStrategy',
    from: deployer.address,
  })
}

deploy.tags = ['FlexStakingStrategyImplementation']
deploy.dependencies = ['FiveYearsFixStakingStrategy']
export default deploy
