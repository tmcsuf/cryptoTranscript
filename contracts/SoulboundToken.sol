// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./interfaces/IERC5484.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SoulboundToken
 * @dev Implementation of the ERC5484 Soulbound Token standard with hash-based data storage
 */
contract SoulboundToken is IERC5484, ERC721Enumerable, AccessControl {
    // tokenID count
    uint256 internal _nextTokenId;

    // Admin Role
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Mapping from token ID to burn authorization
    mapping(uint256 => BurnAuth) private _burnAuth;
    // Mapping from token ID to issuer address
    mapping(uint256 => address) private _issuers;
    // Mapping from token ID to data hash
    mapping(uint256 => bytes32) private _dataHashes;

    // Events
    event TokenMinted(address indexed to, uint256 indexed tokenId, bytes32 dataHash);
    event DataHashUpdated(uint256 indexed tokenId, bytes32 newDataHash);

    /**
     * @dev Initializes the contract by setting a `name` and a `symbol` to the token collection.
     */
    constructor(address admin, string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function addMinter(address minter) public onlyRole(ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, minter);
    }

    function removeMinter(address minter) public onlyRole(ADMIN_ROLE) {
        _revokeRole(MINTER_ROLE, minter);
    }

    /**
     * @dev Mints a new soulbound token and assigns it to `to`.
     * @param to The address that will own the minted token
     * @param burnAuth_ The burn authorization type for this token
     * @param dataHash Hash of the token's data stored off-chain
     */
    function SBTmint(address to, BurnAuth burnAuth_, bytes32 dataHash) public onlyRole(MINTER_ROLE) {
        require(to != address(0), "ERC5484: mint to the zero address");
        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId);
        _burnAuth[tokenId] = burnAuth_;
        _issuers[tokenId] = msg.sender;
        _dataHashes[tokenId] = dataHash;
        
        emit Issued(msg.sender, to, tokenId, burnAuth_);
        emit TokenMinted(to, tokenId, dataHash);
    }

    /**
     * @dev Updates the data hash for a token.
     * @param tokenId The token ID to update
     * @param newDataHash The new data hash
     */
    function updateDataHash(uint256 tokenId, bytes32 newDataHash) public onlyRole(MINTER_ROLE) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        _dataHashes[tokenId] = newDataHash;
        emit DataHashUpdated(tokenId, newDataHash);
    }

    /**
     * @dev Returns the data hash for a token.
     * @param tokenId The token ID to query
     */
    function getDataHash(uint256 tokenId) public view returns (bytes32) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _dataHashes[tokenId];
    }

    /**
     * @dev Burns a token.
     * @param tokenId The token ID to burn
     */
    function burn(uint256 tokenId) public virtual {
        address owner = ownerOf(tokenId);
        require(owner != address(0), "ERC5484: burn for nonexistent token");
        
        BurnAuth auth = _burnAuth[tokenId];
        address issuer = _issuers[tokenId];
        
        if (auth == BurnAuth.IssuerOnly) {
            require(msg.sender == issuer, "ERC5484: only issuer can burn");
        } else if (auth == BurnAuth.OwnerOnly) {
            require(msg.sender == owner, "ERC5484: only owner can burn");
        } else if (auth == BurnAuth.Both) {
            require(msg.sender == owner || msg.sender == issuer, "ERC5484: only owner or issuer can burn");
        } else if (auth == BurnAuth.Neither) {
            revert("ERC5484: token cannot be burned");
        }

        _burn(tokenId);
        delete _burnAuth[tokenId];
        delete _issuers[tokenId];
        delete _dataHashes[tokenId];
    }

    /**
     * @dev See {IERC5484-burnAuth}.
     */
    function burnAuth(uint256 tokenId) public view override returns (BurnAuth) {
        address owner = ownerOf(tokenId);
        require(owner != address(0), "ERC5484: burn auth query for nonexistent token");
        return _burnAuth[tokenId];
    }

    /**
     * @dev Returns the issuer of a token.
     * @param tokenId The token ID to query
     */
    function issuerOf(uint256 tokenId) public view returns (address) {
        address owner = ownerOf(tokenId);
        require(owner != address(0), "ERC5484: issuer query for nonexistent token");
        return _issuers[tokenId];
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721Enumerable, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Override _update function to make tokens non-transferable except during minting
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from = 0) and burning (to = 0)
        if (from != address(0) && to != address(0)) {
            revert("ERC5484: token is non-transferable");
        }
        
        return super._update(to, tokenId, auth);
    }
}
