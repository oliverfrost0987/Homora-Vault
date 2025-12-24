import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedToken = await deploy("HomoraToken", {
    from: deployer,
    log: true,
  });

  const deployedVault = await deploy("HomoraVault", {
    from: deployer,
    args: [deployedToken.address],
    log: true,
  });

  console.log(`HomoraToken contract: `, deployedToken.address);
  console.log(`HomoraVault contract: `, deployedVault.address);
};
export default func;
func.id = "deploy_homora_vault"; // id required to prevent reexecution
func.tags = ["HomoraToken", "HomoraVault"];
