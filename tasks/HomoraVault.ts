import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the HomoraToken and HomoraVault addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const token = await deployments.get("HomoraToken");
    const vault = await deployments.get("HomoraVault");

    console.log("HomoraToken address is " + token.address);
    console.log("HomoraVault address is " + vault.address);
  },
);

task("task:claim", "Claims the faucet amount for HomoraToken").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const token = await deployments.get("HomoraToken");
    const signer = (await ethers.getSigners())[0];
    const tokenContract = await ethers.getContractAt("HomoraToken", token.address);

    const tx = await tokenContract.connect(signer).claim();
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  },
);

task("task:set-operator", "Sets the vault as operator for the caller")
  .addOptionalParam("days", "Operator validity in days", "365")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const token = await deployments.get("HomoraToken");
    const vault = await deployments.get("HomoraVault");
    const signer = (await ethers.getSigners())[0];

    const days = parseInt(taskArguments.days);
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error(`Argument --days must be a positive integer`);
    }

    const until = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
    const tokenContract = await ethers.getContractAt("HomoraToken", token.address);

    const tx = await tokenContract.connect(signer).setOperator(vault.address, until);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:stake", "Stakes HomoraToken into the vault")
  .addParam("amount", "Stake amount in smallest units")
  .addParam("duration", "Lock duration in seconds")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    const amount = BigInt(taskArguments.amount);
    const duration = parseInt(taskArguments.duration);
    if (amount <= 0n) {
      throw new Error(`Argument --amount must be a positive integer`);
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      throw new Error(`Argument --duration must be a positive integer`);
    }

    await fhevm.initializeCLIApi();

    const token = await deployments.get("HomoraToken");
    const vault = await deployments.get("HomoraVault");
    const signer = (await ethers.getSigners())[0];

    const encryptedValue = await fhevm
      .createEncryptedInput(token.address, signer.address)
      .add64(amount)
      .encrypt();

    const vaultContract = await ethers.getContractAt("HomoraVault", vault.address);

    const tx = await vaultContract
      .connect(signer)
      .stake(encryptedValue.handles[0], encryptedValue.inputProof, duration);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:withdraw", "Withdraws the stake from the vault").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const vault = await deployments.get("HomoraVault");
    const signer = (await ethers.getSigners())[0];
    const vaultContract = await ethers.getContractAt("HomoraVault", vault.address);

    const tx = await vaultContract.connect(signer).withdraw();
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  },
);

task("task:decrypt-balance", "Decrypts the HomoraToken balance")
  .addOptionalParam("address", "Optional account address to decrypt")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const token = await deployments.get("HomoraToken");
    const signer = (await ethers.getSigners())[0];
    const account = taskArguments.address ?? signer.address;

    const tokenContract = await ethers.getContractAt("HomoraToken", token.address);
    const encryptedBalance = await tokenContract.confidentialBalanceOf(account);

    if (encryptedBalance === ethers.ZeroHash) {
      console.log(`encrypted balance: ${encryptedBalance}`);
      console.log("clear balance    : 0");
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      token.address,
      signer,
    );

    console.log(`Encrypted balance: ${encryptedBalance}`);
    console.log(`Clear balance    : ${clearBalance}`);
  });

task("task:decrypt-stake", "Decrypts the vault stake amount")
  .addOptionalParam("address", "Optional account address to decrypt")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const vault = await deployments.get("HomoraVault");
    const signer = (await ethers.getSigners())[0];
    const account = taskArguments.address ?? signer.address;

    const vaultContract = await ethers.getContractAt("HomoraVault", vault.address);
    const stake = await vaultContract.getStake(account);
    const encryptedAmount = stake[0];

    if (encryptedAmount === ethers.ZeroHash) {
      console.log(`encrypted stake: ${encryptedAmount}`);
      console.log("clear stake    : 0");
      return;
    }

    const clearAmount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedAmount,
      vault.address,
      signer,
    );

    console.log(`Encrypted stake: ${encryptedAmount}`);
    console.log(`Clear stake    : ${clearAmount}`);
  });
