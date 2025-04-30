// Load contract ABI from artifacts
async function loadContractABI() {
    try {
        const response = await fetch('artifacts/contracts/SoulboundToken.sol/SoulboundToken.json');
        const artifact = await response.json();
        return artifact.abi;
    } catch (error) {
        console.error('Error loading contract ABI:', error);
        throw error;
    }
}

// Browser-compatible data management functions
async function generateContentHash(data) {
    // Instead of relying on JSON.stringify sorting, manually construct the string
    // with keys in a fixed order - EXACTLY matching the server-side
    let jsonString;
    
    if (data.courseCode) {
        // This is a course
        jsonString = `{"courseCode":"${data.courseCode}","courseName":"${data.courseName}","credits":${data.credits},"grade":"${data.grade}","institution":"${data.institution}","semester":"${data.semester}","studentID":"${data.studentID}","year":${data.year}}`;
    } else {
        // This is a diploma
        jsonString = `{"degree":"${data.degree}","graduationDate":${data.graduationDate},"institution":"${data.institution}","major":"${data.major}","studentID":"${data.studentID}"}`;
    }
    
    const msgBuffer = new TextEncoder().encode(jsonString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Make sure hash is in the correct format for the blockchain (0x prefix)
    const finalHash = `0x${hashHex}`;
    
    return finalHash;
}

async function saveData(data, type, id) {
    try {
        // First generate the hash on the client side
        const clientHash = await generateContentHash(data);
        
        // Then save the data
        const response = await fetch(`http://localhost:3001/api/data/${type}/${id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server error:', errorData);
            throw new Error(errorData.details || 'Failed to save data');
        }
        
        const result = await response.json();
        
        // Verify the server's hash matches our client-side hash
        if (result.hash !== clientHash) {
            console.error('Hash mismatch between client and server');
            throw new Error('Hash mismatch between client and server');
        }
        
        return clientHash;
    } catch (error) {
        console.error('Error saving data:', error);
        throw error;
    }
}

// Format a hash string for blockchain compatibility
function formatHashForBlockchain(hashString) {
    // Make sure the hash is a valid 32-byte (64 character) hex string
    // First, remove the 0x prefix if present
    let hex = hashString.startsWith('0x') ? hashString.slice(2) : hashString;
    
    // Pad to 64 characters if needed
    while (hex.length < 64) {
        hex = '0' + hex;
    }
    
    // Truncate to 64 characters if longer
    if (hex.length > 64) {
        hex = hex.slice(0, 64);
    }
    
    // Return with 0x prefix for ethers.js
    return '0x' + hex;
}

async function loadDataByHash(hash, type) {
    try {
        // Format hash to standard format for better matching
        const formattedHash = formatHashForBlockchain(hash);
        
        // Use the formatted hash for lookup
        const response = await fetch(`http://localhost:3001/api/data/${type}/hash/${formattedHash}`);
        if (!response.ok) {
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error loading data:', error);
        return null;
    }
}

// Contract address - you'll need to replace this with your deployed contract address
const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Replace with your contract address

const connectWallet = document.getElementById('connectWallet');
const walletStatus = document.getElementById('walletStatus');
const accountAddress = document.getElementById('accountAddress');
const networkInfo = document.getElementById('networkInfo');
const errorMessage = document.getElementById('errorMessage');
const mintButton = document.getElementById('mintButton');
const tokenType = document.getElementById('tokenType');
const courseFields = document.getElementById('courseFields');
const diplomaFields = document.getElementById('diplomaFields');
const refreshTokensButton = document.getElementById('refreshTokens');
const tokenList = document.getElementById('tokenList');

let provider;
let signer;
let contract;

// Initialize contract
async function initializeContract() {
    try {
        const contractABI = await loadContractABI();
        contract = new ethers.Contract(contractAddress, contractABI, signer);
        console.log('Contract initialized successfully');
    } catch (error) {
        console.error('Error initializing contract:', error);
        errorMessage.textContent = `Error: ${error.message}`;
    }
}

// Toggle form fields based on token type
tokenType.addEventListener('change', () => {
    if (tokenType.value === 'course') {
        courseFields.style.display = 'block';
        diplomaFields.style.display = 'none';
    } else {
        courseFields.style.display = 'none';
        diplomaFields.style.display = 'block';
    }
});

async function checkMinterRole() {
    try {
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const hasRole = await contract.hasRole(MINTER_ROLE, await signer.getAddress());
        console.log('Has MINTER_ROLE:', hasRole);
        if (!hasRole) {
            errorMessage.textContent = 'Your wallet does not have permission to mint tokens. Please connect with an admin wallet.';
            mintButton.disabled = true;
        } else {
            mintButton.disabled = false;
            errorMessage.textContent = '';
        }
        return hasRole;
    } catch (error) {
        console.error('Error checking minter role:', error);
        errorMessage.textContent = `Error: ${error.message}`;
        mintButton.disabled = true;
        return false;
    }
}

// Function to update UI based on user role
async function updateUIForRole() {
    try {
        // Reset all role-based classes
        document.body.classList.remove('admin-user', 'minter-user');
        
        if (!signer) {
            // Hide role-specific sections if not connected
            document.getElementById('mintingSection').parentElement.style.display = 'none';
            document.getElementById('adminSection').parentElement.style.display = 'none';
            
            // Reset user role indicator in the wallet section
            const accountInfo = document.getElementById('accountInfo');
            if (accountInfo.querySelector('.role-indicator')) {
                accountInfo.querySelector('.role-indicator').remove();
            }
            return;
        }

        // Check if user has minter role
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const address = await signer.getAddress();
        const hasMinterRole = await contract.hasRole(MINTER_ROLE, address);
        
        // Check if user has admin role (DEFAULT_ADMIN_ROLE is 0x00)
        const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const hasAdminRole = await contract.hasRole(DEFAULT_ADMIN_ROLE, address);
        
        const isAdminOrMinter = hasMinterRole || hasAdminRole;
        
        // Update UI elements
        const mintingSection = document.getElementById('mintingSection').parentElement;
        const adminSection = document.getElementById('adminSection').parentElement;
        
        // Add appropriate classes to body
        if (hasAdminRole) {
            document.body.classList.add('admin-user');
        } else if (hasMinterRole) {
            document.body.classList.add('minter-user');
        }
        
        // Update account info section with role indicator
        const accountInfo = document.getElementById('accountInfo');
        
        // Remove any existing role indicator
        if (accountInfo.querySelector('.role-indicator')) {
            accountInfo.querySelector('.role-indicator').remove();
        }
        
        // Add role indicator if admin or minter
        if (isAdminOrMinter) {
            const roleIndicator = document.createElement('div');
            roleIndicator.className = 'role-indicator user-info-panel mt-2';
            
            if (hasAdminRole) {
                roleIndicator.innerHTML = '<strong>Role: <span class="admin-role-badge role-badge">Admin</span></strong>';
                mintButton.className = 'btn admin-action-btn';
            } else if (hasMinterRole) {
                roleIndicator.innerHTML = '<strong>Role: <span class="minter-role-badge role-badge">Minter</span></strong>';
                mintButton.className = 'btn minter-action-btn';
            }
            
            accountInfo.appendChild(roleIndicator);
        } else {
            // Reset mint button style for regular users
            mintButton.className = 'btn btn-success';
        }
        
        // Show or hide minting section based on minter role
        if (hasMinterRole || hasAdminRole) {
            mintingSection.style.display = 'block';
            mintingSection.classList.remove('admin-role', 'minter-role');
            
            // Update minting card header to indicate minter status
            const mintingHeader = document.querySelector('[data-bs-target="#mintingSection"]');
            
            if (hasAdminRole) {
                mintingSection.classList.add('admin-role');
                mintingHeader.innerHTML = `
                    <h5 class="mb-0">Mint SBT <span class="badge bg-danger ms-2">Admin</span></h5>
                    <span class="collapse-icon">▼</span>
                `;
            } else {
                mintingSection.classList.add('minter-role');
                mintingHeader.innerHTML = `
                    <h5 class="mb-0">Mint SBT <span class="badge bg-success ms-2">Minter</span></h5>
                    <span class="collapse-icon">▼</span>
                `;
            }
        } else {
            mintingSection.style.display = 'none';
        }
        
        // Show or hide admin section based on admin or minter role
        if (isAdminOrMinter) {
            adminSection.style.display = 'block';
            adminSection.classList.remove('admin-role', 'minter-role');
            
            // Update admin card header to indicate role
            const adminHeader = document.querySelector('[data-bs-target="#adminSection"]');
            
            if (hasAdminRole) {
                adminSection.classList.add('admin-role');
                adminHeader.innerHTML = `
                    <h5 class="mb-0">Admin Dashboard <span class="badge bg-danger ms-2">Admin</span></h5>
                    <span class="collapse-icon">▲</span>
                `;
                
                // Update refresh button to match admin style
                document.getElementById('refreshAllTokens').className = 'btn admin-action-btn mb-3';
            } else {
                adminSection.classList.add('minter-role');
                adminHeader.innerHTML = `
                    <h5 class="mb-0">Admin Dashboard <span class="badge bg-success ms-2">Minter</span></h5>
                    <span class="collapse-icon">▲</span>
                `;
                
                // Update refresh button to match minter style
                document.getElementById('refreshAllTokens').className = 'btn minter-action-btn mb-3';
            }
        } else {
            adminSection.style.display = 'none';
        }
        
        // Update minter status in admin panel if visible
        if (isAdminOrMinter) {
            updateMinterStatus();
        }
        
    } catch (error) {
        console.error('Error updating UI for role:', error);
    }
}

// Update the connectToWallet function to call updateUIForRole
async function connectToWallet() {
    console.log('Attempting to connect wallet...');
    
    if (typeof window.ethereum === 'undefined') {
        const error = 'MetaMask is not installed. Please install MetaMask to use this application.';
        console.error(error);
        errorMessage.textContent = error;
        return;
    }

    try {
        connectWallet.disabled = true;
        errorMessage.textContent = '';
        console.log('Requesting account access...');

        // Request account access
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });

        console.log('Accounts received:', accounts);

        if (accounts.length === 0) {
            throw new Error('No accounts found');
        }

        const account = accounts[0];
        console.log('Selected account:', account);
        
        // Get network information
        console.log('Getting network information...');
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        console.log('Chain ID:', chainId);
        const networkName = getNetworkName(chainId);
        
        // Update UI
        walletStatus.textContent = 'Connected';
        accountAddress.textContent = account;
        networkInfo.textContent = networkName;

        // Initialize ethers
        console.log('Initializing ethers...');
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        
        // Initialize contract with ABI from artifacts
        await initializeContract();

        // Check if the connected wallet has MINTER_ROLE
        await checkMinterRole();

        // Update UI based on user role
        await updateUIForRole();

        // Fetch owned tokens
        await fetchOwnedTokens();

        // Listen for account changes
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        
        // Listen for chain changes
        window.ethereum.on('chainChanged', handleChainChanged);

        console.log('Wallet connection successful');
    } catch (error) {
        console.error('Error connecting wallet:', error);
        if (error.code === 4001) {
            errorMessage.textContent = 'Please connect your MetaMask wallet to continue.';
        } else if (error.code === -32002) {
            errorMessage.textContent = 'Please check your MetaMask window to approve the connection.';
        } else {
            errorMessage.textContent = `Error: ${error.message}`;
        }
        connectWallet.disabled = false;
    }
}

function handleAccountsChanged(accounts) {
    console.log('Accounts changed:', accounts);
    window.location.reload();
}

function handleChainChanged(chainId) {
    console.log('Chain changed:', chainId);
    window.location.reload();
}

function getNetworkName(chainId) {
    const networks = {
        '0x1': 'Ethereum Mainnet',
        '0x5': 'Goerli Testnet',
        '0xaa36a7': 'Sepolia Testnet',
        '0x539': 'Localhost 8545',
        '0x7a69': 'Localhost 8545'
    };
    return networks[chainId] || `Unknown Network (${chainId})`;
}

async function verifyTokenOwnership(tokenId) {
    try {
        const owner = await contract.ownerOf(tokenId);
        console.log('Token ownership verification:');
        console.log('- Token ID:', tokenId);
        console.log('- Owner:', owner);
        console.log('- Expected owner:', document.getElementById('recipientAddress').value);
        return owner;
    } catch (error) {
        console.error('Error verifying token ownership:', error);
        return null;
    }
}

async function checkTokenOwnership(tokenId) {
    try {
        const owner = await contract.ownerOf(tokenId);
        console.log(`Token ${tokenId} ownership:`, owner);
        
        // Check if the token exists
        const exists = await contract.ownerOf(tokenId).catch(() => false);
        console.log(`Token ${tokenId} exists:`, exists);
        
        // Check the burn auth
        const burnAuth = await contract.burnAuth(tokenId);
        const burnAuthNumber = Number(burnAuth);
        console.log(`Token ${tokenId} burn auth:`, burnAuthNumber);
        
        // Check the issuer
        const issuer = await contract.issuerOf(tokenId);
        console.log(`Token ${tokenId} issuer:`, issuer);
        
        // Get the data hash
        const dataHash = await contract.getDataHash(tokenId);
        console.log(`Token ${tokenId} data hash:`, dataHash);
        
        return { owner, burnAuth: burnAuthNumber, issuer, dataHash };
    } catch (error) {
        console.error('Error checking token ownership:', error);
        return null;
    }
}

// Function to fetch and display owned tokens
async function fetchOwnedTokens() {
    try {
        if (!signer) {
            throw new Error('Please connect your wallet first');
        }

        const address = await signer.getAddress();
        console.log('Fetching tokens for address:', address);

        // Clear existing tokens
        tokenList.innerHTML = '';
        
        // Use ERC721Enumerable's balanceOf to get the token count
        const tokenCount = await contract.balanceOf(address);
        const tokenCountNumber = Number(tokenCount);
        console.log(`User has ${tokenCountNumber} tokens`);
        
        if (tokenCountNumber === 0) {
            tokenList.innerHTML = '<div class="list-group-item">No tokens found</div>';
            return;
        }

        // Use ERC721Enumerable's tokenOfOwnerByIndex to get all tokens efficiently
        for (let i = 0; i < tokenCountNumber; i++) {
            try {
                // Get token ID at this index
                const tokenId = await contract.tokenOfOwnerByIndex(address, i);
                const tokenIdNumber = Number(tokenId);
                console.log(`Found token ${tokenIdNumber} owned by ${address} at index ${i}`);
                
                // Get token details
                const tokenDetails = await checkTokenOwnership(tokenIdNumber);
                if (!tokenDetails) continue;
                
                // Try to load the actual data
                let data = null;
                let dataType = 'courses'; // Default to courses
                
                // Log the hash we're looking up
                console.log(`Looking up data for token ${tokenIdNumber}`);
                console.log(`Data hash from blockchain: ${tokenDetails.dataHash}`);
                console.log(`Hash format - length: ${tokenDetails.dataHash.length}, starts with 0x: ${tokenDetails.dataHash.startsWith('0x')}`);

                // Try to load as course first
                data = await loadDataByHash(tokenDetails.dataHash, 'courses');
                if (!data) {
                    // If not found as course, try as diploma
                    data = await loadDataByHash(tokenDetails.dataHash, 'diplomas');
                    if (data) {
                        dataType = 'diplomas';
                    }
                }
                
                // Create token card
                const tokenCard = document.createElement('div');
                tokenCard.className = 'list-group-item';
                
                // Create a burn button for this token
                const burnAuthText = getBurnAuthText(tokenDetails.burnAuth);
                const canBurn = canBurnToken(tokenDetails, address);
                
                if (data) {
                    // Display actual data
                    if (dataType === 'courses') {
                        tokenCard.innerHTML = `
                            <div class="d-flex w-100 justify-content-between">
                                <h5 class="mb-1">Course Token #${tokenIdNumber}</h5>
                                <span class="badge bg-secondary">${burnAuthText}</span>
                            </div>
                            <p class="mb-1">Course: ${data.courseCode} - ${data.courseName}</p>
                            <p class="mb-1">Institution: ${data.institution}</p>
                            <p class="mb-1">Grade: ${data.grade} (${data.credits} credits)</p>
                            <p class="mb-1">Semester: ${data.semester} ${data.year}</p>
                            <p class="mb-1">Student ID: ${data.studentID || 'Not available'}</p>
                            <p class="mb-1">Issuer: ${tokenDetails.issuer}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <small>Token ID: ${tokenIdNumber}</small>
                                <button class="btn btn-sm ${canBurn ? 'btn-danger' : 'btn-secondary'} burn-token-btn" 
                                        data-token-id="${tokenIdNumber}" ${canBurn ? '' : 'disabled'}>
                                    ${canBurn ? 'Burn Token' : 'Cannot Burn'}
                                </button>
                            </div>
                        `;
                    } else {
                        tokenCard.innerHTML = `
                            <div class="d-flex w-100 justify-content-between">
                                <h5 class="mb-1">Diploma Token #${tokenIdNumber}</h5>
                                <span class="badge bg-secondary">${burnAuthText}</span>
                            </div>
                            <p class="mb-1">Degree: ${data.degree}</p>
                            <p class="mb-1">Major: ${data.major}</p>
                            <p class="mb-1">Institution: ${data.institution}</p>
                            <p class="mb-1">Graduation Date: ${new Date(data.graduationDate * 1000).toLocaleDateString()}</p>
                            <p class="mb-1">Student ID: ${data.studentID || 'Not available'}</p>
                            <p class="mb-1">Issuer: ${tokenDetails.issuer}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <small>Token ID: ${tokenIdNumber}</small>
                                <button class="btn btn-sm ${canBurn ? 'btn-danger' : 'btn-secondary'} burn-token-btn" 
                                        data-token-id="${tokenIdNumber}" ${canBurn ? '' : 'disabled'}>
                                    ${canBurn ? 'Burn Token' : 'Cannot Burn'}
                                </button>
                            </div>
                        `;
                    }
                } else {
                    // Fallback to showing hash if data not found
                    tokenCard.innerHTML = `
                        <div class="d-flex w-100 justify-content-between">
                            <h5 class="mb-1">Token #${tokenIdNumber}</h5>
                            <span class="badge bg-secondary">${burnAuthText}</span>
                        </div>
                        <p class="mb-1">Data Hash: ${tokenDetails.dataHash}</p>
                        <p class="mb-1">Student ID: ${tokenDetails.owner}</p>
                        <p class="mb-1">Issuer: ${tokenDetails.issuer}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <small>Token ID: ${tokenIdNumber}</small>
                            <button class="btn btn-sm ${canBurn ? 'btn-danger' : 'btn-secondary'} burn-token-btn" 
                                    data-token-id="${tokenIdNumber}" ${canBurn ? '' : 'disabled'}>
                                ${canBurn ? 'Burn Token' : 'Cannot Burn'}
                            </button>
                        </div>
                    `;
                }
                
                tokenList.appendChild(tokenCard);
            } catch (error) {
                console.error(`Error fetching token at index ${i}:`, error);
            }
        }

        if (tokenList.children.length === 0) {
            tokenList.innerHTML = '<div class="list-group-item">No tokens found</div>';
        } else {
            // Add event listeners to burn buttons
            document.querySelectorAll('.burn-token-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const tokenId = this.getAttribute('data-token-id');
                    document.getElementById('tokenIdToBurn').value = tokenId;
                    
                    // Scroll to the burn section
                    document.querySelector('[data-bs-target="#burnSection"]').click();
                    document.getElementById('burnSection').scrollIntoView({ behavior: 'smooth' });
                });
            });
        }
    } catch (error) {
        console.error('Error fetching tokens:', error);
        tokenList.innerHTML = `<div class="list-group-item text-danger">Error: ${error.message}</div>`;
    }
}

// Helper function to get burn authorization text
function getBurnAuthText(burnAuth) {
    // burnAuth is already converted to a number in checkTokenOwnership
    switch (burnAuth) {
        case 0: return 'Issuer Only';
        case 1: return 'Owner Only';
        case 2: return 'Both';
        case 3: return 'Neither';
        default: return 'Unknown';
    }
}

// Helper function to determine if a user can burn a token
function canBurnToken(tokenDetails, userAddress) {
    if (!tokenDetails) return false;
    
    const burnAuth = tokenDetails.burnAuth; // Already converted to Number in checkTokenOwnership
    const isOwner = tokenDetails.owner.toLowerCase() === userAddress.toLowerCase();
    const isIssuer = tokenDetails.issuer.toLowerCase() === userAddress.toLowerCase();
    
    switch (burnAuth) {
        case 0: // Issuer Only
            return isIssuer;
        case 1: // Owner Only
            return isOwner;
        case 2: // Both
            return isOwner || isIssuer;
        case 3: // Neither
            return false;
        default:
            return false;
    }
}

// Add event listener for refresh button
refreshTokensButton.addEventListener('click', fetchOwnedTokens);

async function mintSBT() {
    try {
        mintButton.disabled = true;
        errorMessage.textContent = '';

        // Check if MetaMask is connected
        if (!window.ethereum) {
            throw new Error('MetaMask is not installed');
        }

        // Check if we're on the correct network
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== '0x539' && chainId !== '0x7a69') { // Localhost chain IDs
            throw new Error('Please connect to your local Hardhat network');
        }

        const burnAuth = parseInt(document.getElementById('burnAuth').value);
        const recipientAddress = document.getElementById('recipientAddress').value;

        // Validate recipient address
        if (!ethers.isAddress(recipientAddress)) {
            throw new Error('Invalid recipient address');
        }

        console.log('Minting parameters:');
        console.log('- Recipient:', recipientAddress);
        console.log('- Burn Auth:', burnAuth);
        console.log('- Token Type:', tokenType.value);
        console.log('- Contract Address:', contractAddress);
        console.log('- Signer Address:', await signer.getAddress());

        // Check if the signer has MINTER_ROLE
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const hasRole = await contract.hasRole(MINTER_ROLE, await signer.getAddress());
        console.log('Signer has MINTER_ROLE:', hasRole);

        if (!hasRole) {
            throw new Error('Your wallet does not have permission to mint tokens');
        }

        // Prepare data based on token type
        let data;
        let dataType;
        if (tokenType.value === 'course') {
            data = {
                institution: document.getElementById('institution').value,
                courseCode: document.getElementById('courseCode').value,
                courseName: document.getElementById('courseName').value,
                credits: parseInt(document.getElementById('credits').value),
                grade: document.getElementById('grade').value,
                semester: document.getElementById('semester').value,
                year: parseInt(document.getElementById('year').value),
                studentID: recipientAddress // Add studentID using recipient address
            };
            dataType = 'courses';
        } else {
            const graduationDate = new Date(document.getElementById('graduationDate').value);
            data = {
                institution: document.getElementById('diplomaInstitution').value,
                major: document.getElementById('major').value,
                degree: document.getElementById('degree').value,
                graduationDate: Math.floor(graduationDate.getTime() / 1000),
                studentID: recipientAddress // Add studentID using recipient address
            };
            dataType = 'diplomas';
        }

        // Save data and get hash
        const clientHash = await saveData(data, dataType, `${Date.now()}`);
        console.log('Data hash generated for blockchain:', clientHash);
        console.log('Data hash length:', clientHash.length);
        console.log('Data hash format check - starts with 0x:', clientHash.startsWith('0x'));

        // Format the hash correctly for the blockchain
        const blockchainHash = formatHashForBlockchain(clientHash);
        console.log('Formatted hash for blockchain:', blockchainHash);
        console.log('Blockchain hash length:', blockchainHash.length);

        // Get the contract with the signer
        const contractWithSigner = contract.connect(signer);
        
        // Call the SBTmint function
        console.log('Calling SBTmint with hash:', blockchainHash);
        const tx = await contractWithSigner.SBTmint(recipientAddress, burnAuth, blockchainHash);
        console.log('Transaction sent:', tx.hash);
        
        // Wait for the transaction to be mined
        const receipt = await tx.wait();
        console.log('Transaction confirmed:', receipt);
        
        // Log the event data
        const event = receipt.logs.find(log => log.fragment?.name === 'TokenMinted');
        if (event) {
            const tokenId = event.args[1].toString();
            const eventDataHash = event.args[2];
            console.log('TokenMinted event:', {
                to: event.args[0],
                tokenId: tokenId,
                dataHash: eventDataHash
            });
            console.log('Hash comparison - client vs blockchain:');
            console.log('- Client hash:    ', clientHash);
            console.log('- Blockchain hash:', eventDataHash);
            console.log('- Match:', clientHash === eventDataHash);
            
            // Check token ownership
            const tokenDetails = await checkTokenOwnership(tokenId);
            if (tokenDetails) {
                console.log('Token minted successfully:', tokenId);
            }
        }

        // After successful mint, refresh the token list
        await fetchOwnedTokens();

        errorMessage.textContent = 'SBT minted successfully!';
    } catch (error) {
        console.error('Error minting SBT:', error);
        if (error.code === 4001) {
            errorMessage.textContent = 'Transaction was rejected by user';
        } else if (error.code === -32002) {
            errorMessage.textContent = 'Please check your MetaMask window to approve the transaction';
        } else {
            errorMessage.textContent = `Error: ${error.message}`;
        }
    } finally {
        mintButton.disabled = false;
    }
}

connectWallet.addEventListener('click', connectToWallet);
mintButton.addEventListener('click', mintSBT);

// Check if already connected
if (window.ethereum) {
    console.log('MetaMask detected, checking for existing connection...');
    window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
            console.log('Existing accounts:', accounts);
            if (accounts.length > 0) {
                connectToWallet();
            }
        })
        .catch(error => {
            console.error('Error checking existing accounts:', error);
        });
} else {
    console.log('MetaMask not detected');
}

// Handle collapsible sections
document.addEventListener('DOMContentLoaded', function() {
    // Initially hide the minting and admin sections until we know user's role
    document.getElementById('mintingSection').parentElement.style.display = 'none';
    document.getElementById('adminSection').parentElement.style.display = 'none';
    
    // Get all collapsible headers
    const collapsibleHeaders = document.querySelectorAll('[data-bs-toggle="collapse"]');
    
    // Add click event listener to each header
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', function() {
            // Toggle the collapse icon
            const icon = this.querySelector('.collapse-icon');
            const targetId = this.getAttribute('data-bs-target');
            const isCollapsed = document.querySelector(targetId).classList.contains('show');
            
            if (isCollapsed) {
                icon.textContent = '▲';
            } else {
                icon.textContent = '▼';
            }
        });
        
        // Set initial icon state
        const targetId = header.getAttribute('data-bs-target');
        const isCollapsed = !document.querySelector(targetId).classList.contains('show');
        const icon = header.querySelector('.collapse-icon');
        icon.textContent = isCollapsed ? '▲' : '▼';
    });
});

async function burnSBT() {
    try {
        const tokenIdInput = document.getElementById('tokenIdToBurn').value;
        
        if (!tokenIdInput || isNaN(parseInt(tokenIdInput))) {
            errorMessage.textContent = 'Please enter a valid token ID';
            return;
        }

        const tokenId = parseInt(tokenIdInput);
        const burnButton = document.getElementById('burnButton');
        burnButton.disabled = true;
        errorMessage.textContent = '';

        // Check if MetaMask is connected
        if (!window.ethereum) {
            throw new Error('MetaMask is not installed');
        }

        console.log('Burning token:', tokenId);

        // First, check token ownership and burn auth
        const tokenInfo = await checkTokenOwnership(tokenId);
        if (!tokenInfo) {
            throw new Error(`Token ${tokenId} does not exist`);
        }

        console.log('Token info:', tokenInfo);
        
        // Check if the wallet has permission to burn
        const walletAddress = await signer.getAddress();
        const burnAuth = tokenInfo.burnAuth; // Already converted to Number in checkTokenOwnership
        const isOwner = tokenInfo.owner.toLowerCase() === walletAddress.toLowerCase();
        const isIssuer = tokenInfo.issuer.toLowerCase() === walletAddress.toLowerCase();
        
        console.log('Burn permissions check:');
        console.log('- Burn Auth:', burnAuth);
        console.log('- Is Owner:', isOwner);
        console.log('- Is Issuer:', isIssuer);
        
        let canBurn = false;
        
        switch (burnAuth) {
            case 0: // Issuer Only
                canBurn = isIssuer;
                break;
            case 1: // Owner Only
                canBurn = isOwner;
                break;
            case 2: // Both
                canBurn = isOwner || isIssuer;
                break;
            case 3: // Neither
                canBurn = false;
                break;
            default:
                canBurn = false;
        }
        
        if (!canBurn) {
            throw new Error('You do not have permission to burn this token');
        }
        
        // Get the contract with the signer
        const contractWithSigner = contract.connect(signer);
        
        // Call the burn function
        const tx = await contractWithSigner.burn(tokenId);
        console.log('Transaction sent:', tx.hash);
        
        // Wait for the transaction to be mined
        const receipt = await tx.wait();
        console.log('Burn transaction confirmed:', receipt);
        
        // After successful burn, refresh the token list
        await fetchOwnedTokens();
        
        errorMessage.textContent = `SBT ${tokenId} burned successfully!`;
        document.getElementById('tokenIdToBurn').value = '';
    } catch (error) {
        console.error('Error burning SBT:', error);
        if (error.code === 4001) {
            errorMessage.textContent = 'Transaction was rejected by user';
        } else if (error.code === -32002) {
            errorMessage.textContent = 'Please check your MetaMask window to approve the transaction';
        } else {
            errorMessage.textContent = `Error: ${error.message}`;
        }
    } finally {
        document.getElementById('burnButton').disabled = false;
    }
}

// Add event listener for burn button
document.getElementById('burnButton').addEventListener('click', burnSBT);

// Admin functionality - Check if the connected wallet has minter role
async function updateMinterStatus() {
    try {
        const minterStatus = document.getElementById('minterStatus');
        
        if (!signer) {
            minterStatus.className = 'alert alert-warning';
            minterStatus.textContent = 'Please connect your wallet first';
            return false;
        }
        
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const address = await signer.getAddress();
        const hasMinterRole = await contract.hasRole(MINTER_ROLE, address);
        
        // Check if user has admin role
        const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const hasAdminRole = await contract.hasRole(DEFAULT_ADMIN_ROLE, address);
        
        if (hasAdminRole) {
            minterStatus.className = 'alert alert-danger';
            minterStatus.innerHTML = `<strong>Admin Status:</strong> This wallet has admin privileges`;
        } else if (hasMinterRole) {
            minterStatus.className = 'alert alert-success';
            minterStatus.innerHTML = `<strong>Minter Status:</strong> This wallet has minter privileges`;
        } else {
            minterStatus.className = 'alert alert-warning';
            minterStatus.innerHTML = `<strong>Role Status:</strong> This wallet does not have special privileges`;
        }
        
        return hasMinterRole || hasAdminRole;
    } catch (error) {
        console.error('Error checking minter status:', error);
        const minterStatus = document.getElementById('minterStatus');
        minterStatus.className = 'alert alert-danger';
        minterStatus.textContent = `Error: ${error.message}`;
        return false;
    }
}

// Function to render a token card for the admin view
function renderTokenCard(tokenId, tokenDetails, data, dataType) {
    const tokenCard = document.createElement('div');
    tokenCard.className = 'list-group-item';
    
    const burnAuthText = getBurnAuthText(tokenDetails.burnAuth);
    
    let content = '';
    
    if (data) {
        if (dataType === 'courses') {
            content = `
                <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">Course Token #${tokenId}</h5>
                    <span class="badge bg-secondary">${burnAuthText}</span>
                </div>
                <p class="mb-1">Course: ${data.courseCode} - ${data.courseName}</p>
                <p class="mb-1">Institution: ${data.institution}</p>
                <p class="mb-1">Grade: ${data.grade} (${data.credits} credits)</p>
                <p class="mb-1">Semester: ${data.semester} ${data.year}</p>
                <p class="mb-1">Student ID: ${data.studentID || 'Not available'}</p>
                <div class="d-flex w-100 justify-content-between">
                    <p class="mb-1"><strong>Owner:</strong> ${tokenDetails.owner}</p>
                    <p class="mb-1"><strong>Issuer:</strong> ${tokenDetails.issuer}</p>
                </div>
            `;
        } else {
            content = `
                <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">Diploma Token #${tokenId}</h5>
                    <span class="badge bg-secondary">${burnAuthText}</span>
                </div>
                <p class="mb-1">Degree: ${data.degree}</p>
                <p class="mb-1">Major: ${data.major}</p>
                <p class="mb-1">Institution: ${data.institution}</p>
                <p class="mb-1">Graduation Date: ${new Date(data.graduationDate * 1000).toLocaleDateString()}</p>
                <p class="mb-1">Student ID: ${data.studentID || 'Not available'}</p>
                <div class="d-flex w-100 justify-content-between">
                    <p class="mb-1"><strong>Owner:</strong> ${tokenDetails.owner}</p>
                    <p class="mb-1"><strong>Issuer:</strong> ${tokenDetails.issuer}</p>
                </div>
            `;
        }
    } else {
        content = `
            <div class="d-flex w-100 justify-content-between">
                <h5 class="mb-1">Token #${tokenId}</h5>
                <span class="badge bg-secondary">${burnAuthText}</span>
            </div>
            <p class="mb-1">Data Hash: ${tokenDetails.dataHash}</p>
            <div class="d-flex w-100 justify-content-between">
                <p class="mb-1"><strong>Owner:</strong> ${tokenDetails.owner}</p>
                <p class="mb-1"><strong>Issuer:</strong> ${tokenDetails.issuer}</p>
            </div>
        `;
    }
    
    tokenCard.innerHTML = content;
    return tokenCard;
}

// Function to fetch and display a single token by ID
async function fetchTokenById(tokenId) {
    try {
        const allTokensList = document.getElementById('allTokensList');
        
        // Try to get token details
        try {
            const tokenDetails = await checkTokenOwnership(tokenId);
            
            if (!tokenDetails) {
                allTokensList.innerHTML = `<div class="list-group-item text-danger">Token #${tokenId} does not exist</div>`;
                return;
            }
            
            // Try to load the actual data
            let data = null;
            let dataType = 'courses'; // Default to courses
            
            // Try to load as course first
            data = await loadDataByHash(tokenDetails.dataHash, 'courses');
            if (!data) {
                // If not found as course, try as diploma
                data = await loadDataByHash(tokenDetails.dataHash, 'diplomas');
                if (data) {
                    dataType = 'diplomas';
                }
            }
            
            // Clear the list and add the single token
            allTokensList.innerHTML = '';
            const tokenCard = renderTokenCard(tokenId, tokenDetails, data, dataType);
            allTokensList.appendChild(tokenCard);
            
        } catch (error) {
            console.error(`Error fetching token ${tokenId}:`, error);
            allTokensList.innerHTML = `<div class="list-group-item text-danger">Error: ${error.message}</div>`;
        }
    } catch (error) {
        console.error('Error in fetchTokenById:', error);
        document.getElementById('allTokensList').innerHTML = `
            <div class="list-group-item text-danger">Error: ${error.message}</div>
        `;
    }
}

// Function to fetch all minted tokens
async function fetchAllTokens() {
    try {
        const allTokensList = document.getElementById('allTokensList');
        allTokensList.innerHTML = '<div class="list-group-item text-center">Loading tokens...</div>';
        
        const tokens = [];
        const maxTokensToShow = 20;
        
        // Use ERC721Enumerable's totalSupply to get the total number of tokens
        const totalSupply = await contract.totalSupply();
        const totalSupplyNumber = Number(totalSupply);
        console.log(`Total supply: ${totalSupplyNumber}`);
        
        if (totalSupplyNumber === 0) {
            allTokensList.innerHTML = '<div class="list-group-item text-center">No tokens found</div>';
            return;
        }
        
        // Determine how many tokens to show (all tokens or max limit)
        const numTokensToShow = Math.min(totalSupplyNumber, maxTokensToShow);
        
        // Use tokenByIndex to get tokens efficiently (in reverse order to show newest first)
        for (let i = totalSupplyNumber - 1; i >= Math.max(0, totalSupplyNumber - numTokensToShow); i--) {
            try {
                // Get token ID at this index
                const tokenId = await contract.tokenByIndex(i);
                const tokenIdNumber = Number(tokenId);
                console.log(`Found token ${tokenIdNumber} at global index ${i}`);
                
                const tokenDetails = await checkTokenOwnership(tokenIdNumber);
                if (tokenDetails) {
                    tokens.push({ id: tokenIdNumber, details: tokenDetails });
                }
            } catch (error) {
                console.error(`Error fetching token at index ${i}:`, error);
                // Continue with the next token
            }
        }
        
        // Clear the list
        allTokensList.innerHTML = '';
        
        if (tokens.length === 0) {
            allTokensList.innerHTML = '<div class="list-group-item text-center">No tokens found</div>';
            return;
        }
        
        // Process each token
        for (const token of tokens) {
            try {
                // Try to load the actual data
                let data = null;
                let dataType = 'courses'; // Default to courses
                
                // Try to load as course first
                data = await loadDataByHash(token.details.dataHash, 'courses');
                if (!data) {
                    // If not found as course, try as diploma
                    data = await loadDataByHash(token.details.dataHash, 'diplomas');
                    if (data) {
                        dataType = 'diplomas';
                    }
                }
                
                const tokenCard = renderTokenCard(token.id, token.details, data, dataType);
                allTokensList.appendChild(tokenCard);
            } catch (error) {
                console.error(`Error loading data for token ${token.id}:`, error);
                // Continue with the next token
            }
        }
    } catch (error) {
        console.error('Error fetching all tokens:', error);
        document.getElementById('allTokensList').innerHTML = `
            <div class="list-group-item text-danger">Error: ${error.message}</div>
        `;
    }
}

// Event listener for the search token button
document.getElementById('searchTokenButton').addEventListener('click', function() {
    const tokenId = document.getElementById('searchTokenId').value;
    if (tokenId && !isNaN(parseInt(tokenId))) {
        fetchTokenById(parseInt(tokenId));
    } else {
        document.getElementById('allTokensList').innerHTML = `
            <div class="list-group-item text-danger">Please enter a valid token ID</div>
        `;
    }
});

// Event listener for the refresh all tokens button
document.getElementById('refreshAllTokens').addEventListener('click', fetchAllTokens);

// Update minter status when wallet is connected
connectWallet.addEventListener('click', async function() {
    await connectToWallet();
    updateMinterStatus();
});

// Update admin section when page loads if wallet is already connected
if (window.ethereum) {
    window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
            if (accounts.length > 0) {
                // This will be called after connectToWallet() in the existing code
                setTimeout(updateMinterStatus, 1000);
            }
        })
        .catch(error => {
            console.error('Error checking existing accounts:', error);
        });
}