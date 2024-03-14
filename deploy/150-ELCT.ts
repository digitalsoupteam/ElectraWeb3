import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')

  const alreadyDeployed = await getOrNull('ELCT') != null
  if(alreadyDeployed) return

  await deploy('ELCT', {
    contract: 'ELCT',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
            'Electra Token', // _name
            'ELCT', // _symbol
            ethers.utils.parseUnits('1000000000', 18), // _initialSupply
          ],
        },
      },
    },
  })
}

deploy.tags = ['ELCT']
deploy.dependencies = ['AddressBook']
export default deploy
