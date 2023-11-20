import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')

  const alreadyDeployed = await getOrNull('Treasury') != null
  if(alreadyDeployed) return
  
  const deployment = await deploy('Treasury', {
    contract: 'Treasury',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
          ],
        },
      },
    },
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)
  await (await addressBook.setTreasury(deployment.address)).wait(1)
}

deploy.tags = ['Treasury']
deploy.dependencies = ['AddressBook']
export default deploy
