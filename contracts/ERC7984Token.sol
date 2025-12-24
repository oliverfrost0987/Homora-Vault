// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract HomoraToken is ERC7984, ZamaEthereumConfig {
    uint64 public constant CLAIM_AMOUNT = 1_000_000_000;

    mapping(address account => bool) private _claimed;

    error AlreadyClaimed(address account);

    constructor() ERC7984("Homora Vault Token", "HVT", "") {}

    function claim() external {
        if (_claimed[msg.sender]) {
            revert AlreadyClaimed(msg.sender);
        }

        _claimed[msg.sender] = true;

        euint64 encryptedAmount = FHE.asEuint64(CLAIM_AMOUNT);
        _mint(msg.sender, encryptedAmount);
        FHE.allow(encryptedAmount, msg.sender);
    }

    function hasClaimed(address account) external view returns (bool) {
        return _claimed[account];
    }
}
