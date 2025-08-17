require("dotenv").config();
const { ethers } = require("hardhat");

async function advanceTime(seconds) {
  if (["localhost", "hardhat"].includes(network.name)) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  } else {
    console.log(
      `⚠️  Cannot advance time on ${network.name}. Please wait manually.`
    );
  }
}

async function main() {
  console.log("⚡ Queueing & Executing Proposal...\n");

  const deployer = new ethers.Wallet(
    process.env.DEPLOYER_PRIVATE_KEY,
    ethers.provider
  );

  const GOVERNOR_ADDR = process.env.GOVERNOR_ADDR;
  const PROPOSAL_ID = process.env.PROPOSAL_ID;

  if (!GOVERNOR_ADDR || !PROPOSAL_ID) {
    throw new Error("❌ Missing GOVERNOR_ADDR or PROPOSAL_ID in .env");
  }

  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = Governor.attach(GOVERNOR_ADDR);

  const state = await governor.state(PROPOSAL_ID);
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

  console.log(`📌 Proposal State: ${states[state]} (${state})`);

  // --- Queue ---
  if (state < 4) {
    if (state !== 3) {
      throw new Error(
        `❌ Cannot queue: proposal is ${states[state]}. Must be Succeeded first.`
      );
    }

    const description = "Add milestone 1: Frontend Dev";
    const descriptionHash = ethers.id(description);

    console.log("⏳ Queueing proposal...");
    const tx = await governor.queue(
      [process.env.TREASURY_ADDR],
      [0],
      [process.env.ADD_CALL_DATA],
      descriptionHash
    );
    await tx.wait();
    console.log("✅ Proposal queued!\n");
  }

  // --- Wait for Timelock ---
  console.log("⏳ Waiting for timelock delay (3600 seconds)...");
  await advanceTime(3600);

  // --- Execute ---
  const description = "Add milestone 1: Frontend Dev";
  const descriptionHash = ethers.id(description);

  console.log("⚡ Executing proposal...");
  const tx = await governor.execute(
    [process.env.TREASURY_ADDR],
    [0],
    [process.env.ADD_CALL_DATA],
    descriptionHash
  );
  await tx.wait();
  console.log("✅ Proposal executed! Milestone added.\n");
}

main().catch(console.error);
