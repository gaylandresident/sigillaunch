import { API_BASE } from "./contracts";
import type { BurnChainId } from "./chains";

export interface AttestResponse {
  attestation: `0x${string}`;
  attester: `0x${string}`;
  digest: `0x${string}`;
  claim: {
    sourceChain: BurnChainId;
    sourceToken: string;
    burner: `0x${string}`;
    recipient: `0x${string}`;
    amount: string;
    usdValueAtBurn: string;
    burnBlock: string;
    burnTxHash: `0x${string}`;
  };
}

/** Human-readable message the burner wallet must sign. Same string on client + server. */
export function bindMessage(params: {
  sourceChain: string;
  burnTxHash: string;
  recipient: string;
}): string {
  return [
    "SIGIL Certificate Claim v1",
    `Chain: ${params.sourceChain}`,
    `Burn tx: ${params.burnTxHash}`,
    `Deliver certificate to: ${params.recipient}`,
    "",
    "I authorize the SIGIL protocol to mint a certificate for this burn to the address above.",
  ].join("\n");
}

export async function requestAttestation(params: {
  sourceChain: BurnChainId;
  sourceToken: string;
  burner: `0x${string}`;      // who did the burn (tx.from)
  recipient: `0x${string}`;   // where the certificate goes
  amount: string;
  burnTxHash: `0x${string}`;
  bindSignature: `0x${string}`; // burner's signature over bindMessage(...)
}): Promise<AttestResponse> {
  const res = await fetch(`${API_BASE}/attest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "attestation failed");
  }
  return res.json();
}

export interface CertificateSummary {
  tokenId: string;
  sourceChain: BurnChainId;
  sourceToken: string;
  amount: string;
  usdValueAtBurn: string;
  burnedAt: number;
  rarity: 0 | 1 | 2 | 3;
  zcashInscriptionTx: string | null;
  zcashStatus: "pending" | "written" | "confirmed" | "failed";
}

export async function fetchCertificates(owner: string): Promise<CertificateSummary[]> {
  const res = await fetch(`${API_BASE}/certificates?owner=${owner}`);
  if (!res.ok) throw new Error("failed to fetch certificates");
  return res.json();
}

export interface LaunchPreparation {
  zsa: {
    assetBase: `0x${string}`;
    issuer: `0x${string}`;
    issueAuthSig: `0x${string}`;
    actions: { assetDescHash: `0x${string}`; amount: string; finalize: boolean }[];
  };
  timestampMs: number;
  description: string;
}

export async function prepareLaunch(params: {
  creator: `0x${string}`;
  name: string;
  symbol: string;
  supply: string;
}): Promise<LaunchPreparation> {
  const res = await fetch(`${API_BASE}/prepare-launch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "prepare-launch failed");
  }
  return res.json();
}

export interface LeaderboardEntry {
  address: string;
  totalBurns: number;
  totalUsdBurned: string;
  legendaryCount: number;
  rank: number;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/leaderboard`);
  if (!res.ok) throw new Error("failed to fetch leaderboard");
  return res.json();
}
