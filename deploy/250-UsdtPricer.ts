import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const deployment = await deploy('UsdtStaticPricer', {
    contract: 'StaticPricer',
    from: deployer.address,
    args: [ethers.utils.parseUnits('1', 8)],
  })
}

deploy.tags = ['UsdtStaticPricer']
export default deploy
