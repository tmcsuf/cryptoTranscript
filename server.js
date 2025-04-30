const express = require('express');
const fs = require('fs/promises');  // Import the promises version directly
const path = require('path');
const { createHash } = require('crypto');
const app = express();

// Enable CORS for client requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Create data directories if they don't exist
const dataDir = path.join(__dirname, 'data');
const coursesDir = path.join(dataDir, 'courses');
const diplomasDir = path.join(dataDir, 'diplomas');

// Create directories if they don't exist
async function ensureDirectoriesExist() {
    try {
        await fs.access(dataDir).catch(() => fs.mkdir(dataDir));
        await fs.access(coursesDir).catch(() => fs.mkdir(coursesDir));
        await fs.access(diplomasDir).catch(() => fs.mkdir(diplomasDir));
    } catch (error) {
        console.error('Error creating directories:', error);
    }
}

// Call the function to create directories
ensureDirectoriesExist();

// Utility function to generate a content hash - EXACTLY matching the browser version
function generateContentHash(data) {
    // Instead of relying on JSON.stringify sorting, manually construct the string
    // with keys in a fixed order
    let jsonString;
    
    if (data.courseCode) {
        // This is a course
        jsonString = `{"courseCode":"${data.courseCode}","courseName":"${data.courseName}","credits":${data.credits},"grade":"${data.grade}","institution":"${data.institution}","semester":"${data.semester}","studentID":"${data.studentID || ''}","year":${data.year}}`;
    } else {
        // This is a diploma
        jsonString = `{"degree":"${data.degree}","graduationDate":${data.graduationDate},"institution":"${data.institution}","major":"${data.major}","studentID":"${data.studentID || ''}"}`;
    }
    
    // The server-side equivalent of TextEncoder and crypto.subtle.digest
    const msgBuffer = Buffer.from(jsonString, 'utf8');
    const hashBuffer = createHash('sha256').update(msgBuffer).digest();
    
    // Equivalent to Array.from(new Uint8Array(hashBuffer))
    const hashArray = Array.from(hashBuffer);
    
    // Equivalent to hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Make sure hash is in the correct format for the blockchain (0x prefix)
    const finalHash = `0x${hashHex}`;
    
    return finalHash;
}

async function saveData(data, type, id) {
    try {
        const hash = generateContentHash(data);
        
        // Determine the correct directory based on type
        const dir = type === 'courses' ? coursesDir : diplomasDir;
        const filePath = path.join(dir, `${id}.json`);
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        
        return { success: true, hash };
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
    
    // Return with 0x prefix for consistency
    return '0x' + hex;
}

// Save data endpoint
app.post('/api/data/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const data = req.body;
        
        const result = await saveData(data, type, id);
        
        res.json(result);
    } catch (error) {
        console.error('Error in POST /api/data/:type/:id:', error);
        res.status(500).json({ 
            error: 'Failed to save data',
            details: error.message
        });
    }
});

// Load data by hash endpoint
app.get('/api/data/:type/hash/:hash', async (req, res) => {
    try {
        const { type, hash } = req.params;
        const dir = path.join(__dirname, 'data', type);
        
        // Format the hash for consistent comparison
        const formattedRequestHash = formatHashForBlockchain(hash);
        
        try {
            await fs.access(dir);
        } catch (error) {
            return res.status(404).json({ error: 'Data not found' });
        }
        
        const files = await fs.readdir(dir);
        
        // Try to find a match using either hash format
        for (const file of files) {
            const filePath = path.join(dir, file);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            
            // Try both hash calculation methods
            const newStyleHash = generateContentHash(data);
            const formattedNewStyleHash = formatHashForBlockchain(newStyleHash);
            
            // Calculate old style hash for backward compatibility
            const oldStyleJsonString = JSON.stringify(data, Object.keys(data).sort());
            const oldStyleMsgBuffer = Buffer.from(oldStyleJsonString, 'utf8');
            const oldStyleHashBuffer = createHash('sha256').update(oldStyleMsgBuffer).digest();
            const oldStyleHashArray = Array.from(oldStyleHashBuffer);
            const oldStyleHashHex = oldStyleHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            const oldStyleHash = `0x${oldStyleHashHex}`;
            const formattedOldStyleHash = formatHashForBlockchain(oldStyleHash);
            
            // Check if either hash matches
            if (
                formattedNewStyleHash === formattedRequestHash || 
                formattedOldStyleHash === formattedRequestHash ||
                newStyleHash === hash ||
                oldStyleHash === hash
            ) {
                return res.json(data);
            }
        }
        
        res.status(404).json({ error: 'Data not found' });
    } catch (error) {
        console.error('Error loading data:', error);
        res.status(500).json({ 
            error: 'Failed to load data',
            details: error.message
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Data directories:');
    console.log('- Courses:', coursesDir);
    console.log('- Diplomas:', diplomasDir);
}); 