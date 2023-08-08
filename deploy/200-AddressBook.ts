import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const GovernanceDeployment = await get('Governance')

  const deployment = await deploy('AddressBook', {
    contract: 'AddressBook',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            GovernanceDeployment.address, // _governance
          ],
        },
      },
    },
  })

  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)

  await (await governance.setAddressBook(deployment.address)).wait()

}

deploy.tags = ['AddressBook']
deploy.dependencies = ['Governance']
export default deploy
