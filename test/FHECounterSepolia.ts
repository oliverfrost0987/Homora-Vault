import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { deployments, ethers, fhevm } from "hardhat";
import { HomoraToken, HomoraVault } from "../types";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("HomoraVaultSepolia", function () {
  let signers: Signers;
  let token: HomoraToken;
  let vault: HomoraVault;
  let tokenAddress: string;
  let vaultAddress: string;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const tokenDeployment = await deployments.get("HomoraToken");
      const vaultDeployment = await deployments.get("HomoraVault");
      tokenAddress = tokenDeployment.address;
      vaultAddress = vaultDeployment.address;
      token = await ethers.getContractAt("HomoraToken", tokenDeployment.address);
      vault = await ethers.getContractAt("HomoraVault", vaultDeployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  it("claims and stakes on Sepolia", async function () {
    this.timeout(4 * 60000);

    const claimed = await token.hasClaimed(signers.alice.address);
    if (!claimed) {
      const claimTx = await token.connect(signers.alice).claim();
      await claimTx.wait();
    }

    const encryptedBalance = await token.confidentialBalanceOf(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      tokenAddress,
      signers.alice,
    );
    expect(clearBalance).to.be.greaterThan(0n);

    const stakeData = await vault.getStake(signers.alice.address);
    if (!stakeData[2]) {
      const latestBlock = await ethers.provider.getBlock("latest");
      const until = (latestBlock?.timestamp ?? 0) + 24 * 60 * 60;
      const setOpTx = await token.connect(signers.alice).setOperator(vaultAddress, until);
      await setOpTx.wait();

      const stakeAmount = 100_000_000n;
      const encryptedInput = await fhevm
        .createEncryptedInput(tokenAddress, signers.alice.address)
        .add64(stakeAmount)
        .encrypt();

      const stakeTx = await vault
        .connect(signers.alice)
        .stake(encryptedInput.handles[0], encryptedInput.inputProof, 120);
      await stakeTx.wait();
    }

    const updatedStake = await vault.getStake(signers.alice.address);
    if (updatedStake[2]) {
      const decryptedStake = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        updatedStake[0],
        vaultAddress,
        signers.alice,
      );
      expect(decryptedStake).to.be.greaterThan(0n);
    }
  });
});
