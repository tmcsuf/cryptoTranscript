# Blockchain-Based Academic Transcript System

## Student Information
- **Name:** Tenshi Mori
- **CWID:** 884440884
- **Email:** tenshim@csu.fullerton.edu

## Project Overview
This project implements a blockchain-based academic transcript system using Hardhat, Ethereum, and IPFS abstraction. The system enables the secure storage and verification of academic records such as course completions and diplomas using soulbound tokens (SBTs).

## Features
- Secure storage of academic records on the blockchain
- IPFS-like content-addressed storage for transcript data
- Soulbound tokens for non-transferable digital credentials
- Web interface for viewing and verifying academic records

## Prerequisites
- Node.js (v16 or later)
- NPM (v8 or later)
- Git

## Installation
1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```

## Project Setup
Follow these steps to start the project:

### 1. Compile Solidity Contracts
Compile the smart contracts (SoulboundToken.sol and others):
```
npm run compile
```
or
```
npx hardhat compile
```

### 2. Start Local Blockchain Network
Start a local Hardhat node:
```
npm run network
```
or
```
npx hardhat node
```

### 3. Start IPFS Mimic Service
Run the server that handles the storage and retrieval of academic record data:
```
node server.js
```
or
```
npm start
```

### 4. Deploy Smart Contracts
Deploy the contracts to the local network:
```
npm run deploy
```
or
```
npx hardhat ignition deploy ignition/modules/deploy.js --network localhost
```

### 5. Start Web Interface
Start the browser-sync server to serve the web interface:
```
npm run serve
```

Now you can access the application at http://localhost:3000

## Testing
Run tests to verify the smart contracts:
```
npm test
```

## Project Structure
- `contracts/`: Solidity smart contracts
  - `SoulboundToken.sol`: Implementation of the non-transferable tokens
- `server.js`: IPFS Mimic service
- `scripts/`: Helper scripts
- `ignition/modules/`: Hardhat Ignition deployment modules
- `test/`: Test files

## License
ISC
