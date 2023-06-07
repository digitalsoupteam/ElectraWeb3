import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const initialPrice = ethers.utils.parseUnits('1', 8);

  const deployment = await deploy('EltcPricerToUSD', {
    contract: 'PricerToUSD',
    from: deployer.address,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            initialPrice, // _initialPrice
          ],
        },
      },
    },
  })
}

deploy.tags = ['EltcPricerToUSD']
export default deploy
