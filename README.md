# Homora Vault

Homora Vault is a privacy-preserving staking app built on Zama's FHEVM. Users claim a confidential token, stake an
encrypted amount, set a lock duration, and withdraw after the unlock time. Amounts stay encrypted on-chain while the
time lock remains public and verifiable.

## Table of Contents

- Overview
- Problems Solved
- Key Features
- Advantages
- Architecture
- Tech Stack
- Setup and Installation
- Configuration
- Local Development and Testing
- Deployment
- Frontend Usage
- Hardhat Tasks
- Security and Privacy Notes
- Limitations
- Roadmap
- License

## Overview

Homora Vault combines a confidential ERC-7984 token with a time-locked vault. The vault stores each stake as an FHE
encrypted value, so observers cannot see deposit sizes while the protocol still enforces unlock times.

Core user flow:
1. Connect wallet on Sepolia.
2. Claim HomoraToken once.
3. Approve the vault as operator for confidential transfers.
4. Stake an encrypted amount and set a lock duration.
5. Withdraw after the unlock time.
6. Decrypt balances and staked amounts locally through the Zama relayer SDK.

## Problems Solved

- Public staking reveals sensitive allocation data on-chain.
- Traditional locks are transparent in both amount and duration.
- Users need privacy without sacrificing on-chain verifiability.

Homora Vault keeps the stake amount confidential while still enforcing a public unlock time that anyone can verify.

## Key Features

- One-time token claim with confidential minting.
- Stake with encrypted amount using FHEVM handles and proofs.
- Single active stake per account with an enforced unlock timestamp.
- Withdraw only after the lock expires.
- User-side decryption of balance and staked amount through Zama relayer SDK.
- Frontend reads with viem and writes with ethers.

## Advantages

- Amount privacy: staked values are encrypted on-chain.
- Clear unlock policy: unlock time is public and deterministic.
- Simple UX: claim, set operator, stake, withdraw.
- FHE-native: built for Zama FHEVM with ERC-7984 compatibility.
- Clean separation of read and write paths in the frontend.

## Architecture

Contracts:
- `contracts/ERC7984Token.sol` (HomoraToken): confidential ERC-7984 token with one-time claim.
- `contracts/HomoraVault.sol`: time-locked vault storing encrypted stake amounts.
- `contracts/FHECounter.sol`: sample FHEVM contract (not part of the vault flow).

Backend scripts:
- `deploy/deploy.ts`: deploys HomoraToken and HomoraVault.
- `tasks/HomoraVault.ts`: claim, stake, withdraw, decrypt, and address helpers.

Frontend:
- `app/` contains the React + Vite UI.
- Contract addresses and ABIs live in `app/src/config/contracts.ts`.
- Zama relayer initialization lives in `app/src/hooks/useZamaInstance.ts`.

ABI source of truth:
- Always copy ABIs from `deployments/sepolia` into the frontend config.

## Tech Stack

Smart contracts:
- Solidity 0.8.27
- Hardhat with hardhat-deploy
- Zama FHEVM libraries
- OpenZeppelin confidential ERC-7984

Frontend:
- React + Vite + TypeScript
- wagmi + RainbowKit
- viem for reads, ethers for writes
- @zama-fhe/relayer-sdk for local decryption
- CSS (no Tailwind)

## Setup and Installation

Root dependencies:
```bash
npm install
```

Frontend dependencies:
```bash
cd app
npm install
```

## Configuration

Hardhat environment (root `.env`):
```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
# Optional
ETHERSCAN_API_KEY=your_etherscan_key
```

Notes:
- Do not use MNEMONIC. Private key deployment only.
- `.env` is used for contracts and deployment only, not the frontend.

Frontend configuration (no environment variables):
1. Replace `projectId` in `app/src/config/wagmi.ts` with a WalletConnect project id.
2. Update `TOKEN_ADDRESS` and `VAULT_ADDRESS` in `app/src/config/contracts.ts`.
3. Copy the latest ABIs from `deployments/sepolia` into `app/src/config/contracts.ts`.

## Local Development and Testing

Compile contracts:
```bash
npm run compile
```

Run tests:
```bash
npm run test
```

Note: Current tests focus on `FHECounter`. Vault-specific tests are planned.

## Deployment

Required order:
1. Run tasks and tests locally.
2. Deploy to Sepolia with a private key.

Local node (for contract dev only):
```bash
npx hardhat node
npx hardhat deploy --network localhost
```

Sepolia deployment:
```bash
npx hardhat deploy --network sepolia
```

Verify (optional):
```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

After deploying, copy ABIs and addresses from `deployments/sepolia` into the frontend config.

## Frontend Usage

Start the UI:
```bash
cd app
npm run dev
```

Usage steps:
1. Connect a wallet on Sepolia.
2. Claim HomoraToken.
3. Set the vault as operator.
4. Stake an amount and set a lock duration.
5. Refresh state to view encrypted and decrypted values.
6. Withdraw after unlock time.

Frontend constraints:
- No localhost blockchain network.
- No localStorage usage.
- No frontend environment variables.
- No imports from the repository root.

## Hardhat Tasks

Addresses:
```bash
npx hardhat task:address --network sepolia
```

Claim tokens:
```bash
npx hardhat task:claim --network sepolia
```

Set vault operator:
```bash
npx hardhat task:set-operator --days 365 --network sepolia
```

Stake:
```bash
npx hardhat task:stake --amount 1000000 --duration 86400 --network sepolia
```

Withdraw:
```bash
npx hardhat task:withdraw --network sepolia
```

Decrypt balance:
```bash
npx hardhat task:decrypt-balance --network sepolia
```

Decrypt stake:
```bash
npx hardhat task:decrypt-stake --network sepolia
```

## Security and Privacy Notes

- Stake amounts are encrypted and stored as FHE handles.
- Unlock time is public and enforced by the vault.
- Users decrypt values locally through the relayer SDK and wallet signatures.
- Operator approval is required for confidential transfers.
- Metadata like unlock time and addresses are still public.

## Limitations

- One active stake per account.
- Unlock time is public.
- Frontend currently targets Sepolia only.
- Vault tests are not yet included.

## Roadmap

- Add full vault unit and integration tests.
- Multi-position staking or flexible lock options.
- Additional network support after Sepolia validation.
- Better error surfacing and loading states in the UI.
- Improve documentation for advanced FHE flows and relayer reliability.

## License

BSD-3-Clause-Clear. See `LICENSE`.
