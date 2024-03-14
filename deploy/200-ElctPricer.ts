import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const AddressBookDeployment = await get('AddressBook')
 
  const alreadyDeployed = await getOrNull('ElctPricer') != null
  if(alreadyDeployed) return
  
  const deployment = await deploy('ElctPricer', {
    contract: 'Pricer',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
            ethers.utils.parseUnits('0.1', 8), // _initialPrice
            'ELCT / USD', // _description
          ],
        },
      },
    },
  })
}

deploy.tags = ['ElctPricer']
deploy.dependencies = ['ELCT']
export default deploy
