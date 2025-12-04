// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GameModRoyaltiesFHE is SepoliaConfig {
    struct EncryptedMod {
        uint256 id;
        euint32 encryptedName;
        euint32 encryptedDescription;
        euint32 encryptedCreator;
        uint256 timestamp;
    }

    struct DecryptedMod {
        string name;
        string description;
        string creator;
        bool isRevealed;
    }

    uint256 public modCount;
    mapping(uint256 => EncryptedMod) public encryptedMods;
    mapping(uint256 => DecryptedMod) public decryptedMods;

    mapping(string => euint32) private encryptedDonationCount;
    string[] private modCategories;

    mapping(uint256 => uint256) private requestToModId;

    event ModSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event ModDecrypted(uint256 indexed id);

    modifier onlyCreator(uint256 modId) {
        _;
    }

    function submitEncryptedMod(
        euint32 encryptedName,
        euint32 encryptedDescription,
        euint32 encryptedCreator
    ) public {
        modCount += 1;
        uint256 newId = modCount;

        encryptedMods[newId] = EncryptedMod({
            id: newId,
            encryptedName: encryptedName,
            encryptedDescription: encryptedDescription,
            encryptedCreator: encryptedCreator,
            timestamp: block.timestamp
        });

        decryptedMods[newId] = DecryptedMod({
            name: "",
            description: "",
            creator: "",
            isRevealed: false
        });

        emit ModSubmitted(newId, block.timestamp);
    }

    function requestModDecryption(uint256 modId) public onlyCreator(modId) {
        EncryptedMod storage modData = encryptedMods[modId];
        require(!decryptedMods[modId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(modData.encryptedName);
        ciphertexts[1] = FHE.toBytes32(modData.encryptedDescription);
        ciphertexts[2] = FHE.toBytes32(modData.encryptedCreator);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMod.selector);
        requestToModId[reqId] = modId;

        emit DecryptionRequested(modId);
    }

    function decryptMod(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 modId = requestToModId[requestId];
        require(modId != 0, "Invalid request");

        EncryptedMod storage eMod = encryptedMods[modId];
        DecryptedMod storage dMod = decryptedMods[modId];
        require(!dMod.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);
        string[] memory results = abi.decode(cleartexts, (string[]));

        dMod.name = results[0];
        dMod.description = results[1];
        dMod.creator = results[2];
        dMod.isRevealed = true;

        if (!FHE.isInitialized(encryptedDonationCount[dMod.creator])) {
            encryptedDonationCount[dMod.creator] = FHE.asEuint32(0);
        }
        encryptedDonationCount[dMod.creator] = FHE.add(
            encryptedDonationCount[dMod.creator],
            FHE.asEuint32(1)
        );

        emit ModDecrypted(modId);
    }

    function getDecryptedMod(uint256 modId) public view returns (
        string memory name,
        string memory description,
        string memory creator,
        bool isRevealed
    ) {
        DecryptedMod storage m = decryptedMods[modId];
        return (m.name, m.description, m.creator, m.isRevealed);
    }

    function getEncryptedDonationCount(string memory creator) public view returns (euint32) {
        return encryptedDonationCount[creator];
    }

    function requestDonationDecryption(string memory creator) public {
        euint32 count = encryptedDonationCount[creator];
        require(FHE.isInitialized(count), "Creator not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDonationCount.selector);
        requestToModId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(creator)));
    }

    function decryptDonationCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 creatorHash = requestToModId[requestId];
        string memory creator = getCreatorFromHash(creatorHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getCreatorFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < modCategories.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(modCategories[i]))) == hash) {
                return modCategories[i];
            }
        }
        revert("Creator not found");
    }
}
