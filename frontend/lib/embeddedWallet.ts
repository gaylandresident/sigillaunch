/**
 * Client-side embedded wallet — mirrors zcashstamp.com's
 * "Create a Zcash address for me" flow, adapted for Robinhood Chain (EVM).
 *
 *   - Uses viem's mnemonicToAccount (BIP-39 → BIP-32 → derived EVM key)
 *   - 12-word English mnemonic, generated with @scure/bip39 CSPRNG
 *   - Stored only in the user's browser (localStorage) — nothing hits our servers
 *   - Ships with a "hand it to your real wallet later" import phrase, same UX
 *     as zcashstamp's Ywallet handoff
 */

import { mnemonicToAccount } from "viem/accounts";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const LS_KEY = "sigil.embeddedWallet.v1";

export interface EmbeddedWallet {
  mnemonic: string;   // 12-word phrase — display once, warn user
  address: `0x${string}`;
  createdAt: number;
}

export function createEmbeddedWallet(): EmbeddedWallet {
  const mnemonic = generateMnemonic(wordlist, 128); // 128 bits → 12 words
  const account = mnemonicToAccount(mnemonic);
  const wallet: EmbeddedWallet = {
    mnemonic,
    address: account.address as `0x${string}`,
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(wallet));
  } catch {}
  return wallet;
}

export function loadEmbeddedWallet(): EmbeddedWallet | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EmbeddedWallet;
  } catch {
    return null;
  }
}

export function clearEmbeddedWallet() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

/** Split the mnemonic into rows for display, mirroring zcashstamp's monospace grid. */
export function mnemonicRows(mnemonic: string, cols = 4): string[][] {
  const words = mnemonic.split(/\s+/).filter(Boolean);
  const rows: string[][] = [];
  for (let i = 0; i < words.length; i += cols) rows.push(words.slice(i, i + cols));
  return rows;
}
