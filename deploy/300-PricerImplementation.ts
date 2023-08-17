import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'
import { USDT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const deployment = await deploy('PricerImplementation', {
    contract: 'Pricer',
    from: deployer.address,
  })

  const GovernanceDeployment = await get('Governance')
  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)

  await (await governance.setPricerImplementation(deployment.address)).wait()

  await (
    await governance.addTokenWithCustomPricer(
      USDT, // _token
      ethers.utils.parseUnits('1', 8), // _initialPrice
      'USDT / USD', // _description
    )
  ).wait()

  // await (
  //   await governance.addTokenWithCustomPricer(
  //     ELCT, // _token
  //     ethers.utils.parseUnits('10', 8), // _initialPrice
  //     'ELCT / USD', // _description
  //   )
  // ).wait()
}

deploy.tags = ['PricerImplementation']
deploy.dependencies = ['Governance', 'Treasury', 'AddressBook']
export default deploy
