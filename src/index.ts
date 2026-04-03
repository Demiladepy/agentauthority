// Core
export { PolicyEngine } from './core/policy-engine';
export { AuthorityManager, Ed25519Signer } from './core/authority-manager';
export type { SigningProvider } from './core/authority-manager';

// Types
export type {
  SpendingPolicy,
  PolicyOverrides,
  SpendingAuthority,
  AuthorityStatus,
  TransactionIntent,
  ValidationResult,
  ValidationErrorCode,
  PermissionRequest,
  NegotiationResult,
  AuditEvent,
  AuditEventType,
  AgentIdentity,
} from './core/types';

// x402
export { X402Handler } from './x402/handler';
export type { X402PaymentRequired, X402PaymentResult } from './x402/handler';

// Agents
export { AutonomousAgent } from './agents/autonomous-agent';
export type { AgentTask, TaskResult, AgentConfig } from './agents/autonomous-agent';

// Quick-start
export { createAgentNetwork } from './quick-start';
export type { AgentNetworkConfig, AgentSpec, AgentNetwork } from './quick-start';

// OWS
export { OWSSigner, createOWSWallet } from './ows/signer';

// MoonPay
export { fundAgentWallet, checkBalance } from './moonpay/funding';
export type { MoonPayFundingConfig, FundingResult } from './moonpay/funding';

// Chains
export { getChainAdapter, SolanaAdapter, EVMAdapter, CHAIN_INFO } from './chains/chain-adapter';
export type { ChainAdapter, ChainInfo } from './chains/chain-adapter';
