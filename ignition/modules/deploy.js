const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("TranscriptTokenModule", (m) => {
  const admin = m.getAccount(0);
  const transcriptToken = m.contract("SoulboundToken", [admin, "TranscriptToken", "TRS"]);

  return { transcriptToken };
}); 