require("dotenv").config();
const { ethers, network } = require("hardhat");

async function advanceTime(seconds) {
  if (network.name === "localhost" || network.name === "hardhat") {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  } else {
    console.log(
      `⚠️  Cannot advance time on network: ${network.name}. Please wait manually.`
    );
  }
}

async function waitForProposalState(
  governor,
  proposalId,
  expectedState,
  interval = 15000,
  maxTries = 120
) {
  const states = [
    "Pending",
    "Active",
    "Defeated",
    "Succeeded",
    "Queued",
    "Executed",
    "Expired",
    "Canceled",
  ];
  for (let i = 0; i < maxTries; i++) {
    try {
      const state = await governor.state(proposalId);
      console.log(
        `⏳ Current state = ${
          states[Number(state)]
        } (${state}) (expecting ${expectedState})`
      );
      if (state === expectedState) {
        console.log(
          `✅ Proposal reached state: ${states[Number(state)]} (${state})`
        );
        return;
      }
    } catch (err) {
      console.log("⚠️ Error checking state, retrying...", err.message);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`❌ Proposal did not reach state ${expectedState} in time`);
}

async function main() {
  console.log("🔗 Starting Interaction...\n");

  const deployer = (await ethers.getSigners())[0];
  const user1 = new ethers.Wallet(
    process.env.USER1_PRIVATE_KEY,
    ethers.provider
  );
  const user2 = new ethers.Wallet(
    process.env.USER2_PRIVATE_KEY,
    ethers.provider
  );
  const beneficiary = { address: process.env.BENEFICIARY_ADDRESS };

  const CAMPAIGN_FACTORY_ADDR = process.env.CAMPAIGN_FACTORY_ADDR;
  const GOVERNOR_ADDR = process.env.GOVERNOR_ADDR;
  const TOKEN_ADDR = process.env.TOKEN_ADDR;
  const TIMELOCK_ADDR = process.env.TIMELOCK_ADDR;

  if (
    !CAMPAIGN_FACTORY_ADDR ||
    !GOVERNOR_ADDR ||
    !TOKEN_ADDR ||
    !TIMELOCK_ADDR ||
    !beneficiary.address
  ) {
    throw new Error("❌ Missing addresses in .env");
  }

  const CampaignFactory = await ethers.getContractFactory("CampaignFactory");
  const campaignFactory = CampaignFactory.attach(CAMPAIGN_FACTORY_ADDR);

  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = Governor.attach(GOVERNOR_ADDR);

  const Token = await ethers.getContractFactory("CrowdchainGovernor");
  const token = Token.attach(TOKEN_ADDR);

  // --------------------------------------------------------------------
  // Create Campaign
  // --------------------------------------------------------------------
  console.log("📌 Creating Campaign...");
  const tx = await campaignFactory.createCampaign(
    "Education Fund",
    "Raising funds for decentralized education",
    ethers.parseEther("0.0002"),
    7,
    beneficiary.address
  );
  const receipt = await tx.wait();
  const event = receipt.logs.find(
    (log) => log.fragment?.name === "CampaignCreated"
  );
  if (!event) throw new Error("❌ CampaignCreated event not found");
  const campaignAddress = event.args.campaign;
  console.log(`✅ Campaign deployed at: ${campaignAddress}\n`);

  // --------------------------------------------------------------------
  // Users fund the campaign
  // --------------------------------------------------------------------
  console.log("💰 Funding Campaign...");
  await user1.sendTransaction({
    to: campaignAddress,
    value: ethers.parseEther("0.0001"),
  });
  console.log("   ➡️ User1 funded 0.0001 ETH");

  await user2.sendTransaction({
    to: campaignAddress,
    value: ethers.parseEther("0.0001"),
  });
  console.log("   ➡️ User2 funded 0.0001 ETH");

  const Campaign = await ethers.getContractFactory("Campaign");
  const campaign = Campaign.attach(campaignAddress);

  const totalFunded = await campaign.totalFunded();
  console.log(`📊 Total Funded: ${ethers.formatEther(totalFunded)} ETH\n`);

  // --------------------------------------------------------------------
  // Deploy & Fund Treasury
  // --------------------------------------------------------------------
  console.log("⏳ Deploying Treasury...");
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(campaignAddress);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log(`✅ Treasury deployed at: ${treasuryAddr}\n`);

  // Transfer ownership to Timelock
  await treasury.connect(deployer).transferOwnership(TIMELOCK_ADDR);
  console.log("🔐 Treasury ownership transferred to Timelock\n");

  // Fund Treasury
  await deployer.sendTransaction({
    to: treasuryAddr,
    value: ethers.parseEther("0.0001"),
  });
  console.log("💎 0.0001 ETH sent to Treasury\n");

  // --------------------------------------------------------------------
  // 4. Delegate & Propose: Add Milestone
  // --------------------------------------------------------------------
  console.log("🗳️ Preparing Governance Proposal...");

  await token.connect(deployer).delegate(deployer.address);
  console.log("👤 Voting power delegated\n");

  const addCall = treasury.interface.encodeFunctionData("addMilestone", [
    1,
    ethers.parseEther("0.00005"),
    "Frontend Development",
  ]);

  const description = "Add milestone 1: Frontend Dev";

  console.log("🚀 Submitting proposal...");
  const proposeTx = await governor.propose(
    [treasuryAddr],
    [0],
    [addCall],
    description
  );
  const receipt2 = await proposeTx.wait();
  const proposalEvent = receipt2.logs.find(
    (l) => l.fragment?.name === "ProposalCreated"
  );
  if (!proposalEvent) throw new Error("❌ ProposalCreated event not found");

  const args = proposalEvent.args;
  const proposalId = args[0];
  console.log(`🔍 Proposal ID: ${proposalId.toString()}`);

  // Debug snapshot
  const snapshot = await governor.proposalSnapshot(proposalId);
  const deadline = await governor.proposalDeadline(proposalId);
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log(`📌 Proposal will activate at block: ${snapshot}`);
  console.log(`📌 Proposal deadline: ${deadline}`);
  console.log(`📌 Current block: ${currentBlock}`);

  await waitForProposalState(governor, proposalId, 1n, 15000, 60);

  await governor.castVote(proposalId, 1);
  console.log("🗳️ Vote cast\n");

  console.log("⏳ Waiting for proposal to succeed...");
  await waitForProposalState(governor, proposalId, 3n, 30000, 60);

  const GovernorFactory = await ethers.getContractFactory("MyGovernor");
  const freshGovernor = GovernorFactory.attach(GOVERNOR_ADDR);

  console.log("📡 Governor address:", await freshGovernor.getAddress());
  console.log("✅ Governor instance is valid and ready to queue.");

  // Queue
  const descriptionHash = ethers.id(description);
  try {
    await freshGovernor.queue([treasuryAddr], [0], [addCall], descriptionHash);
    console.log("✅ Proposal queued\n");
  } catch (err) {
    console.error("❌ Queue failed:", err.message);
    throw err;
  }

  // Timelock delay (1 hour)
  console.log("⏳ Waiting for timelock delay...");
  await advanceTime(3600);

  // Execute
  await governor.execute([treasuryAddr], [0], [addCall], descriptionHash);
  console.log("✅ Milestone 1 added via governance\n");

  // --------------------------------------------------------------------
  // Propose: Release Milestone
  // --------------------------------------------------------------------
  const releaseCall = treasury.interface.encodeFunctionData(
    "releaseMilestone",
    [1]
  );
  const releaseDesc = "Release milestone 1";

  const releasePropTx = await governor.propose(
    [treasuryAddr],
    [0],
    [releaseCall],
    releaseDesc
  );
  const releaseReceipt = await releasePropTx.wait();
  const releaseEvent = releaseReceipt.logs.find(
    (l) => l.fragment?.name === "ProposalCreated"
  );
  if (!releaseEvent) throw new Error("❌ ProposalCreated event not found");
  const releaseId = releaseEvent.args[0];

  console.log("🗳️ Voting on release proposal...");
  await governor.castVote(releaseId, 1);

  console.log("⏳ Waiting for release proposal to succeed...");
  await waitForProposalState(governor, releaseId, 3n, 30000, 60);

  const releaseHash = ethers.id(releaseDesc);
  await governor.queue([treasuryAddr], [0], [releaseCall], releaseHash);
  console.log("⏳ Release proposal queued\n");

  console.log("⏳ Waiting for timelock delay...");
  await advanceTime(3600);

  await governor.execute([treasuryAddr], [0], [releaseCall], releaseHash);
  console.log("✅ Milestone 1 released to beneficiary\n");
  console.log("🎯 Interaction Completed Successfully!");
}

main().catch((error) => {
  console.error("❌ Interaction Failed:", error);
  process.exit(1);
});
