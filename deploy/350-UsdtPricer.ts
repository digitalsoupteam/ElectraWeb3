import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Pricer__factory, Treasury__factory } from '../typechain-types'
import { USDT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const PricerImplementationDeployment = await get('PricerImplementation')
  const AddressBookDeployment = await get('AddressBook')
  const TreasuryDeployment = await get('Treasury')
 
  const deployment = await deploy('UsdtPricer', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      PricerImplementationDeployment.address,
      Pricer__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        ethers.utils.parseUnits('1', 8), // _initialPrice
        'USDT / USD', // _description
      ])
    ]
  })

  const treasury = Treasury__factory.connect(TreasuryDeployment.address, deployer)

  await (await treasury.addToken(USDT, deployment.address)).wait()
}

deploy.tags = ['UsdtPricer']
deploy.dependencies = ['PricerImplementation', 'AddressBook', 'Treasury']
export default deploy
