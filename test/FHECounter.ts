import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";
import { HomoraToken, HomoraToken__factory, HomoraVault, HomoraVault__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

const CLAIM_AMOUNT = 1_000_000_000n;

async function deployFixture() {
  const tokenFactory = (await ethers.getContractFactory("HomoraToken")) as HomoraToken__factory;
  const token = (await tokenFactory.deploy()) as HomoraToken;
  const tokenAddress = await token.getAddress();

  const vaultFactory = (await ethers.getContractFactory("HomoraVault")) as HomoraVault__factory;
  const vault = (await vaultFactory.deploy(tokenAddress)) as HomoraVault;
  const vaultAddress = await vault.getAddress();

  return { token, tokenAddress, vault, vaultAddress };
}

describe("HomoraVault", function () {
  let signers: Signers;
  let token: HomoraToken;
  let tokenAddress: string;
  let vault: HomoraVault;
  let vaultAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ token, tokenAddress, vault, vaultAddress } = await deployFixture());
  });

  it("claims, stakes, and withdraws with encrypted amounts", async function () {
    await token.connect(signers.alice).claim();

    await expect(token.connect(signers.alice).claim())
      .to.be.revertedWithCustomError(token, "AlreadyClaimed")
      .withArgs(signers.alice.address);

    const encryptedBalance = await token.confidentialBalanceOf(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      tokenAddress,
      signers.alice,
    );
    expect(clearBalance).to.eq(CLAIM_AMOUNT);

    const latestBlock = await ethers.provider.getBlock("latest");
    const until = (latestBlock?.timestamp ?? 0) + 24 * 60 * 60;
    await token.connect(signers.alice).setOperator(vaultAddress, until);

    const stakeAmount = 400_000_000n;
    const encryptedInput = await fhevm
      .createEncryptedInput(tokenAddress, signers.alice.address)
      .add64(stakeAmount)
      .encrypt();

    const lockDuration = 3600;
    const stakeTx = await vault
      .connect(signers.alice)
      .stake(encryptedInput.handles[0], encryptedInput.inputProof, lockDuration);
    await stakeTx.wait();

    const stakeData = await vault.getStake(signers.alice.address);
    expect(stakeData[2]).to.eq(true);

    const decryptedStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      stakeData[0],
      vaultAddress,
      signers.alice,
    );
    expect(decryptedStake).to.eq(stakeAmount);

    const encryptedBalanceAfterStake = await token.confidentialBalanceOf(signers.alice.address);
    const clearBalanceAfterStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalanceAfterStake,
      tokenAddress,
      signers.alice,
    );
    expect(clearBalanceAfterStake).to.eq(CLAIM_AMOUNT - stakeAmount);

    await expect(vault.connect(signers.alice).withdraw()).to.be.revertedWithCustomError(vault, "StakeLocked");

    await ethers.provider.send("evm_increaseTime", [lockDuration]);
    await ethers.provider.send("evm_mine", []);

    await vault.connect(signers.alice).withdraw();

    const finalStake = await vault.getStake(signers.alice.address);
    expect(finalStake[2]).to.eq(false);

    const encryptedBalanceAfterWithdraw = await token.confidentialBalanceOf(signers.alice.address);
    const clearBalanceAfterWithdraw = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalanceAfterWithdraw,
      tokenAddress,
      signers.alice,
    );
    expect(clearBalanceAfterWithdraw).to.eq(CLAIM_AMOUNT);
  });
});
