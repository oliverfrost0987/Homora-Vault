// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

contract HomoraVault is ZamaEthereumConfig {
    struct StakePosition {
        euint64 amount;
        uint256 unlockTime;
        bool active;
    }

    IERC7984 public immutable token;

    mapping(address account => StakePosition) private _stakes;

    event Staked(address indexed account, euint64 amount, uint256 unlockTime);
    event Withdrawn(address indexed account, euint64 amount);

    error InvalidDuration();
    error ActiveStakeExists();
    error NoActiveStake();
    error StakeLocked(uint256 unlockTime);
    error ZeroAddress();

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) {
            revert ZeroAddress();
        }
        token = IERC7984(tokenAddress);
    }

    function stake(externalEuint64 encryptedAmount, bytes calldata inputProof, uint256 duration) external {
        if (duration == 0) {
            revert InvalidDuration();
        }

        StakePosition storage current = _stakes[msg.sender];
        if (current.active) {
            revert ActiveStakeExists();
        }

        euint64 transferred = token.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        current.amount = transferred;
        current.unlockTime = block.timestamp + duration;
        current.active = true;

        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        emit Staked(msg.sender, transferred, current.unlockTime);
    }

    function withdraw() external {
        StakePosition storage current = _stakes[msg.sender];
        if (!current.active) {
            revert NoActiveStake();
        }
        if (block.timestamp < current.unlockTime) {
            revert StakeLocked(current.unlockTime);
        }

        euint64 amount = current.amount;

        current.active = false;
        current.unlockTime = 0;
        current.amount = FHE.asEuint64(0);

        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);

        token.confidentialTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function getStake(address account) external view returns (euint64 amount, uint256 unlockTime, bool active) {
        StakePosition storage current = _stakes[account];
        return (current.amount, current.unlockTime, current.active);
    }

    function isWithdrawable(address account) external view returns (bool) {
        StakePosition storage current = _stakes[account];
        return current.active && block.timestamp >= current.unlockTime;
    }

    function getToken() external view returns (address) {
        return address(token);
    }
}
