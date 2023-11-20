import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Pricer__factory, Treasury__factory } from '../typechain-types'
import { ELCT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const PricerImplementationDeployment = await get('PricerImplementation')
  const AddressBookDeployment = await get('AddressBook')
  const TreasuryDeployment = await get('Treasury')
 
  const alreadyDeployed = await getOrNull('ElctPricer') != null
  if(alreadyDeployed) return

  const deployment = await deploy('ElctPricer', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      PricerImplementationDeployment.address,
      Pricer__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        ethers.utils.parseUnits('10', 8), // _initialPrice
        'ELCT / USD', // _description
      ])
    ]
  })

  const treasury = Treasury__factory.connect(TreasuryDeployment.address, deployer)
  await (await treasury.addToken(ELCT, deployment.address)).wait(1)
}

deploy.tags = ['ElctPricer']
deploy.dependencies = ['PricerImplementation', 'AddressBook', 'Treasury']
export default deploy
