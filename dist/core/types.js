"use strict";
/**
 * Agent Spending Authority Protocol — Core Types
 *
 * The fundamental data structures that define how agents
 * request, receive, delegate, and enforce spending authority.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationErrorCode = void 0;
var ValidationErrorCode;
(function (ValidationErrorCode) {
    ValidationErrorCode["AUTHORITY_EXPIRED"] = "AUTHORITY_EXPIRED";
    ValidationErrorCode["AUTHORITY_REVOKED"] = "AUTHORITY_REVOKED";
    ValidationErrorCode["AUTHORITY_EXHAUSTED"] = "AUTHORITY_EXHAUSTED";
    ValidationErrorCode["EXCEEDS_SPENDING_LIMIT"] = "EXCEEDS_SPENDING_LIMIT";
    ValidationErrorCode["EXCEEDS_TRANSACTION_LIMIT"] = "EXCEEDS_TRANSACTION_LIMIT";
    ValidationErrorCode["PROGRAM_NOT_ALLOWED"] = "PROGRAM_NOT_ALLOWED";
    ValidationErrorCode["DESTINATION_NOT_ALLOWED"] = "DESTINATION_NOT_ALLOWED";
    ValidationErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ValidationErrorCode["INVALID_SIGNATURE"] = "INVALID_SIGNATURE";
    ValidationErrorCode["DELEGATION_DEPTH_EXCEEDED"] = "DELEGATION_DEPTH_EXCEEDED";
    ValidationErrorCode["INSUFFICIENT_DELEGATION_BUDGET"] = "INSUFFICIENT_DELEGATION_BUDGET";
})(ValidationErrorCode || (exports.ValidationErrorCode = ValidationErrorCode = {}));
//# sourceMappingURL=types.js.map