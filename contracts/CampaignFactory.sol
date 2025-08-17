// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {Campaign} from "./Campaign.sol";

contract CampaignFactory {
    address public immutable implementation;
    address public owner;
    address[] public campaigns;

    event CampaignCreated(
        address indexed campaign,
        address indexed creator,
        string name,
        uint256 goal,
        uint256 deadline
    );

    constructor() {
        implementation = address(new Campaign());
        owner = msg.sender;
    }

    function createCampaign(
        string memory _name,
        string memory _description,
        uint256 _goal,
        uint256 _durationDays,
        address _beneficiary
    ) external returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(msg.sender, block.timestamp));
        address clone = Clones.cloneDeterministic(implementation, salt);

        Campaign(payable(clone)).initialize(
            _name,
            _description,
            _goal,
            _durationDays,
            _beneficiary,
            msg.sender
        );

        campaigns.push(clone);

        emit CampaignCreated(
            clone,
            msg.sender,
            _name,
            _goal,
            block.timestamp + _durationDays * 1 days
        );

        return clone;
    }

    function getAllCampaigns() external view returns (address[] memory) {
        return campaigns;
    }
}
