const { ethers, run } = require("hardhat");

async function verify(address, constructorArgs = [], contract = null) {
  console.log(`🔍 Verifying ${address} ...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
      ...(contract && { contract }),
    });
    console.log(`✅ Verified: ${address}\n`);
  } catch (err) {
    if (err.message.toLowerCase().includes("already verified")) {
      console.log(`ℹ️ Already verified: ${address}\n`);
    } else {
      console.error(`❌ Verification failed for ${address}:`, err.message);
    }
  }
}

async function main() {
  console.log("🚀 Starting Deployment...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`👤 Deployer: ${deployer.address}\n`);

  // --------------------------------------------------------------------
  // Deploy TimelockController
  // --------------------------------------------------------------------
  console.log("⏳ Deploying TimelockController...");
  const TimelockController = await ethers.getContractFactory(
    "TimelockController"
  );
  const timelock = await TimelockController.deploy(
    3600,
    [deployer.address],
    [deployer.address],
    deployer.address
  );
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();
  console.log(`✅ Timelock deployed at: ${timelockAddr}\n`);

  // --------------------------------------------------------------------
  // Deploy Governance Token (custom)
  // --------------------------------------------------------------------
  console.log("⏳ Deploying Governance Token...");
  const GovToken = await ethers.getContractFactory("CrowdchainGovernor");
  const token = await GovToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`✅ Governance Token deployed at: ${tokenAddr}\n`);

  // Mint tokens to deployer for voting power
  await token.mint(deployer.address, ethers.parseEther("1000"));
  console.log("💰 Minted 1000 tokens to deployer\n");

  // --------------------------------------------------------------------
  // Deploy Governor
  // --------------------------------------------------------------------
  console.log("⏳ Deploying Governor...");
  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = await Governor.deploy(tokenAddr, timelockAddr);
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log(`✅ Governor deployed at: ${governorAddr}\n`);

  // --------------------------------------------------------------------
  // Deploy CampaignFactory
  // --------------------------------------------------------------------
  console.log("⏳ Deploying CampaignFactory...");
  const CampaignFactory = await ethers.getContractFactory("CampaignFactory");
  const campaignFactory = await CampaignFactory.deploy();
  await campaignFactory.waitForDeployment();
  const factoryAddr = await campaignFactory.getAddress();
  console.log(`✅ CampaignFactory deployed at: ${factoryAddr}\n`);

  // --------------------------------------------------------------------
  // Grant Timelock Roles
  // --------------------------------------------------------------------
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

  await timelock.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governorAddr);
  await timelock.connect(deployer).grantRole(PROPOSER_ROLE, governorAddr);
  await timelock.connect(deployer).grantRole(EXECUTOR_ROLE, governorAddr);

  console.log("🔐 Governor granted roles in Timelock\n");

  console.log("🎯 Deployment Completed!\n");

  // --------------------------------------------------------------------
  // Verify Contracts
  // --------------------------------------------------------------------
  console.log("🔑 Starting Verification...\n");

  // TimelockController
  await verify(
    timelockAddr,
    [3600, [deployer.address], [deployer.address], deployer.address],
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController"
  );

  // CrowdchainGovernor (token)
  await verify(
    tokenAddr,
    [deployer.address],
    "contracts/GovernanceToken.sol:CrowdchainGovernor"
  );

  // MyGovernor
  await verify(
    governorAddr,
    [tokenAddr, timelockAddr],
    "contracts/CrowdchainGovernor.sol:MyGovernor"
  );

  // CampaignFactory
  await verify(
    factoryAddr,
    [],
    "contracts/CampaignFactory.sol:CampaignFactory"
  );

  console.log("✅ All contracts verified successfully!");
}

main().catch((error) => {
  console.error("❌ Deployment Failed:", error);
  process.exit(1);
});
