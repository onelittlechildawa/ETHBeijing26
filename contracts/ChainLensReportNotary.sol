// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ChainLensReportNotary {
    struct Attestation {
        address issuer;
        uint64 attestedAt;
    }

    address public immutable issuer;
    mapping(bytes32 => Attestation) public attestations;

    event ReportAttested(bytes32 indexed reportHash, address indexed issuer, uint256 attestedAt);

    error EmptyHash();
    error InvalidIssuer();
    error Unauthorized();

    constructor(address issuer_) {
        if (issuer_ == address(0)) revert InvalidIssuer();
        issuer = issuer_;
    }

    function attest(bytes32 reportHash) external returns (bool created) {
        if (msg.sender != issuer) revert Unauthorized();
        if (reportHash == bytes32(0)) revert EmptyHash();

        Attestation storage existing = attestations[reportHash];
        if (existing.attestedAt != 0) {
            return false;
        }

        existing.issuer = msg.sender;
        existing.attestedAt = uint64(block.timestamp);
        emit ReportAttested(reportHash, msg.sender, block.timestamp);
        return true;
    }

    function isAttested(bytes32 reportHash) external view returns (bool) {
        return attestations[reportHash].attestedAt != 0;
    }
}
