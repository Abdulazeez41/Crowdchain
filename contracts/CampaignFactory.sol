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

    /// @notice Get details of a single campaign by index
    function getCampaign(uint256 index) external view returns (
        address campaignAddress,
        string memory name,
        string memory description,
        uint256 goal,
        uint256 deadline,
        address beneficiary,
        address creator,
        uint256 totalFunded,
        bool isActive
    ) {
        require(index < campaigns.length, "Invalid index");
        Campaign c = Campaign(payable(campaigns[index]));
        return (
            address(c),
            c.name(),
            c.description(),
            c.goal(),
            c.deadline(),
            c.beneficiary(),
            c.creator(),
            c.totalFunded(),
            c.isActive()
        );
    }

    /// @notice Fetch all campaign details in one call
    function getAllCampaignDetails() external view returns (
        address[] memory campaignAddresses,
        string[] memory names,
        string[] memory descriptions,
        uint256[] memory goals,
        uint256[] memory deadlines,
        address[] memory beneficiaries,
        address[] memory creators,
        uint256[] memory totalFunded,
        bool[] memory actives
    ) {
        uint256 len = campaigns.length;

        campaignAddresses = new address[](len);
        names = new string[](len);
        descriptions = new string[](len);
        goals = new uint256[](len);
        deadlines = new uint256[](len);
        beneficiaries = new address[](len);
        creators = new address[](len);
        totalFunded = new uint256[](len);
        actives = new bool[](len);

        for (uint256 i = 0; i < len; i++) {
            Campaign c = Campaign(payable(campaigns[i]));
            campaignAddresses[i] = address(c);
            names[i] = c.name();
            descriptions[i] = c.description();
            goals[i] = c.goal();
            deadlines[i] = c.deadline();
            beneficiaries[i] = c.beneficiary();
            creators[i] = c.creator();
            totalFunded[i] = c.totalFunded();
            actives[i] = c.isActive();
        }
    }
}
